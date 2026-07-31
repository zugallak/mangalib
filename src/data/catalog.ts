import "server-only";

import {
  isImportable,
  resolveDetectionStatus,
  seriesMatchKey,
  type DetectionResolution,
  type ResolvableDetection,
} from "@/domain/catalog";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Catalog data access.
 *
 * LOGICAL identity for the MVP is: seriesMatchKey(title) + volume number.
 * Publisher / edition hints are metadata only and NEVER affect identity — so a
 * re-scan of the same shelf with different AI publisher guesses resolves to the
 * same logical volumes and creates nothing.
 *
 * Reads (matching) use the RLS-aware user client. Writes (find-or-create) use
 * the service-role client (RLS denies catalog INSERT to normal users).
 * Ownership writes never happen here.
 */

interface CatalogIndex {
  /** series match key → set of volume numbers present anywhere in the catalog */
  catalogNumbersByKey: Map<string, Set<number>>;
  /** series match key → set of volume numbers the current user owns */
  ownedNumbersByKey: Map<string, Set<number>>;
  /** series match keys that exist at all in the catalog */
  knownKeys: Set<string>;
}

async function loadCatalogIndex(seriesTitles: readonly string[]): Promise<CatalogIndex> {
  const supabase = await createClient();

  const wanted = new Set(seriesTitles.map(seriesMatchKey).filter((k) => k.length > 0));

  const catalogNumbersByKey = new Map<string, Set<number>>();
  const ownedNumbersByKey = new Map<string, Set<number>>();
  const knownKeys = new Set<string>();

  if (wanted.size === 0) return { catalogNumbersByKey, ownedNumbersByKey, knownKeys };

  // Series matching the wanted keys (grouping duplicate rows by match key so
  // pre-repair duplicate series behave as one logical series).
  const { data: seriesRows } = await supabase.from("series").select("id, title");
  const keyBySeriesId = new Map<string, string>();
  const matchedSeriesIds: string[] = [];
  for (const row of seriesRows ?? []) {
    const key = seriesMatchKey(row.title);
    if (!wanted.has(key)) continue;
    keyBySeriesId.set(row.id, key);
    knownKeys.add(key);
    matchedSeriesIds.push(row.id);
  }

  if (matchedSeriesIds.length === 0) return { catalogNumbersByKey, ownedNumbersByKey, knownKeys };

  const { data: editionRows } = await supabase
    .from("edition")
    .select("id, series_id")
    .in("series_id", matchedSeriesIds);

  const keyByEditionId = new Map<string, string>();
  const editionIds: string[] = [];
  for (const e of editionRows ?? []) {
    const key = keyBySeriesId.get(e.series_id);
    if (!key) continue;
    keyByEditionId.set(e.id, key);
    editionIds.push(e.id);
  }

  if (editionIds.length === 0) return { catalogNumbersByKey, ownedNumbersByKey, knownKeys };

  const { data: volumeRows } = await supabase
    .from("volume")
    .select("id, edition_id, volume_number")
    .in("edition_id", editionIds);

  const keyByVolumeId = new Map<string, string>();
  const volumeIds: string[] = [];
  for (const v of volumeRows ?? []) {
    const key = keyByEditionId.get(v.edition_id);
    if (!key) continue;
    keyByVolumeId.set(v.id, key);
    volumeIds.push(v.id);
    const set = catalogNumbersByKey.get(key) ?? new Set<number>();
    set.add(v.volume_number);
    catalogNumbersByKey.set(key, set);
  }

  if (volumeIds.length > 0) {
    const { data: owned } = await supabase
      .from("owned_volume")
      .select("volume_id")
      .in("volume_id", volumeIds);
    // Map owned volume ids back to (key, number) via the volume rows.
    const numberByVolumeId = new Map<string, number>();
    for (const v of volumeRows ?? []) numberByVolumeId.set(v.id, v.volume_number);
    for (const o of owned ?? []) {
      const key = keyByVolumeId.get(o.volume_id);
      const number = numberByVolumeId.get(o.volume_id);
      if (!key || number === undefined) continue;
      const set = ownedNumbersByKey.get(key) ?? new Set<number>();
      set.add(number);
      ownedNumbersByKey.set(key, set);
    }
  }

  return { catalogNumbersByKey, ownedNumbersByKey, knownKeys };
}

/**
 * Resolve reviewed detections against the shared catalog + the user's
 * ownership using LOGICAL identity (match key + number). Survives repeated
 * scans: the same logical volume resolves to "owned" even if publisher/edition
 * hints changed between scans.
 */
export async function resolveDetections(
  detections: readonly ResolvableDetection[],
): Promise<DetectionResolution[]> {
  const index = await loadCatalogIndex(detections.map((d) => d.seriesTitle));
  return detections.map((d) => resolveOne(d, index));
}

function resolveOne(d: ResolvableDetection, index: CatalogIndex): DetectionResolution {
  const key = seriesMatchKey(d.seriesTitle);
  const status = resolveDetectionStatus({
    importable: isImportable(d),
    volumeNumber: d.volumeNumber,
    catalogNumbers: index.catalogNumbersByKey.get(key),
    ownedNumbers: index.ownedNumbersByKey.get(key),
  });
  return { detectionId: d.detectionId, status };
}

/**
 * Find or create the catalog volume for a validated detection, returning its
 * id. LOGICAL identity: series match key + volume number. Publisher/edition
 * hints are ignored — they never cause a new series, edition or volume.
 *
 * Uses the service-role client (RLS denies catalog writes to normal users).
 */
export async function findOrCreateVolumeId(input: {
  seriesTitle: string;
  volumeNumber: number;
}): Promise<string> {
  const svc = createServiceClient();
  const key = seriesMatchKey(input.seriesTitle);

  // 1) Series — reuse an existing series with the same match key (canonical =
  //    earliest created). Only create if none exists.
  const { data: seriesRows, error: seriesErr } = await svc
    .from("series")
    .select("id, title, created_at");
  if (seriesErr) throw seriesErr;
  const matching = (seriesRows ?? [])
    .filter((s) => seriesMatchKey(s.title) === key)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let seriesId = matching[0]?.id;
  if (!seriesId) {
    // Write match_key here (JS-computed) so the stored value is identical to
    // seriesMatchKey() by construction — the DB never recomputes it.
    const { data, error } = await svc
      .from("series")
      .insert({ title: input.seriesTitle.trim(), match_key: key })
      .select("id")
      .single();
    if (error) throw error;
    seriesId = data.id;
  }
  const seriesIds = matching.length > 0 ? matching.map((s) => s.id) : [seriesId];

  // 2) Reuse an existing volume with this number anywhere in the series'
  //    editions (across duplicate series sharing the key), regardless of
  //    publisher/edition.
  const { data: editionRows, error: edErr } = await svc
    .from("edition")
    .select("id, series_id, created_at")
    .in("series_id", seriesIds);
  if (edErr) throw edErr;

  const editions = (editionRows ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const editionIds = editions.map((e) => e.id);

  if (editionIds.length > 0) {
    const { data: existingVolume, error: volErr } = await svc
      .from("volume")
      .select("id")
      .in("edition_id", editionIds)
      .eq("volume_number", input.volumeNumber)
      .limit(1)
      .maybeSingle();
    if (volErr) throw volErr;
    if (existingVolume) return existingVolume.id;
  }

  // 3) Need to create the volume → attach to the canonical (earliest) edition
  //    of the canonical series. Create a minimal default edition only if the
  //    series has none. Publisher stays NULL (never trusted from AI).
  const canonicalSeriesId = seriesIds[0];
  let editionId = editions.find((e) => e.series_id === canonicalSeriesId)?.id ?? editions[0]?.id;
  if (!editionId) {
    const { data, error } = await svc
      .from("edition")
      .insert({ series_id: canonicalSeriesId, publisher: null })
      .select("id")
      .single();
    if (error) throw error;
    editionId = data.id;
  }

  const { data: inserted, error: insErr } = await svc
    .from("volume")
    .insert({ edition_id: editionId, volume_number: input.volumeNumber })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}
