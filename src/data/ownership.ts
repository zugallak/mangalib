import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Ownership writes. All use the RLS-aware user client — never the service
 * role — so the database enforces that a user can only touch their own rows.
 */

/**
 * Mark a volume as owned by the current user. Idempotent: if the user already
 * owns it, this is a no-op (no second row, no error) thanks to the
 * UNIQUE(user_id, volume_id) constraint + ignoreDuplicates.
 *
 * This is what makes overlapping bookshelf scans safe — re-detecting a volume
 * the user already has never changes anything.
 */
export async function addOwnedVolume(volumeId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("owned_volume")
    .upsert(
      { user_id: user.id, volume_id: volumeId },
      { onConflict: "user_id,volume_id", ignoreDuplicates: true },
    );

  if (error) throw error;
}

/** Add many volumes at once, idempotently (used by the future scan import). */
export async function addOwnedVolumes(volumeIds: readonly string[]): Promise<void> {
  if (volumeIds.length === 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rows = [...new Set(volumeIds)].map((volume_id) => ({
    user_id: user.id,
    volume_id,
  }));

  const { error } = await supabase
    .from("owned_volume")
    .upsert(rows, { onConflict: "user_id,volume_id", ignoreDuplicates: true });

  if (error) throw error;
}

/** Remove a volume from the current user's library. */
export async function removeOwnedVolume(volumeId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("owned_volume")
    .delete()
    .eq("user_id", user.id)
    .eq("volume_id", volumeId);

  if (error) throw error;
}
