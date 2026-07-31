import "server-only";

import { isImportable } from "@/domain/catalog";
import { partitionByOwnership } from "@/domain/library";
import { findOrCreateVolumeId } from "@/data/catalog";
import { addOwnedVolumes } from "@/data/ownership";
import { createClient } from "@/lib/supabase/server";

export interface ImportDetectionInput {
  seriesTitle: string;
  volumeNumber: number | null;
  publisher: string | null;
}

export interface ImportResult {
  requested: number;
  skippedIncomplete: number;
  resolved: number;
  added: number;
  alreadyOwned: number;
}

/**
 * Import validated detections into the user's library. Runs only after
 * explicit user confirmation.
 *
 *   validated detections
 *     → find-or-create catalog volume ids (service role, trusted)
 *     → dedupe volume ids
 *     → compare against current ownership
 *     → insert only new ownership rows (RLS user client, idempotent)
 *
 * Already-owned volumes never error and never create a second row.
 */
export async function importValidatedDetections(
  detections: readonly ImportDetectionInput[],
): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const importable = detections.filter(
    (d): d is ImportDetectionInput & { volumeNumber: number } =>
      isImportable(d) && d.volumeNumber !== null,
  );
  const skippedIncomplete = detections.length - importable.length;

  // Resolve/create catalog volume ids (service-role, one at a time so failures
  // are attributable). Never uses the service role for ownership.
  const volumeIds: string[] = [];
  for (const d of importable) {
    const id = await findOrCreateVolumeId({
      seriesTitle: d.seriesTitle,
      volumeNumber: d.volumeNumber,
      publisher: d.publisher,
    });
    volumeIds.push(id);
  }
  const uniqueIds = [...new Set(volumeIds)];

  // Partition against current ownership using the RLS-aware client.
  const ownedSet = new Set<string>();
  if (uniqueIds.length > 0) {
    const { data: owned, error } = await supabase
      .from("owned_volume")
      .select("volume_id")
      .in("volume_id", uniqueIds);
    if (error) throw error;
    for (const o of owned ?? []) ownedSet.add(o.volume_id);
  }

  const { alreadyOwned, toAdd } = partitionByOwnership(uniqueIds, ownedSet);

  // Idempotent insert of only the new rows.
  await addOwnedVolumes(toAdd);

  return {
    requested: detections.length,
    skippedIncomplete,
    resolved: uniqueIds.length,
    added: toAdd.length,
    alreadyOwned: alreadyOwned.length,
  };
}
