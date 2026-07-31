import "server-only";

import { buildSeriesDetail } from "@/domain/library";
import type { SeriesDetail } from "@/domain/types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { toSeries, toVolume } from "@/data/mappers";

/**
 * Load one series with its full volume list, annotated with the current
 * user's ownership. Returns null when the series does not exist or Supabase
 * is not configured.
 */
export async function getSeriesDetail(seriesId: string): Promise<SeriesDetail | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();

  const { data: seriesRow } = await supabase
    .from("series")
    .select("id, title, original_title")
    .eq("id", seriesId)
    .maybeSingle();
  if (!seriesRow) return null;

  const { data: editions } = await supabase
    .from("edition")
    .select("id, series_id")
    .eq("series_id", seriesId);

  const editionIds = (editions ?? []).map((e) => e.id);

  const { data: volumeRows } = editionIds.length
    ? await supabase
        .from("volume")
        .select("id, edition_id, volume_number, isbn, title, cover_url")
        .in("edition_id", editionIds)
    : { data: [] as const };

  const volumes = (volumeRows ?? []).map(toVolume);
  const volumeIds = volumes.map((v) => v.id);

  // Owned volume ids for the signed-in user (RLS scopes this automatically).
  const ownedVolumeIds = new Set<string>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && volumeIds.length) {
    const { data: owned } = await supabase
      .from("owned_volume")
      .select("volume_id")
      .in("volume_id", volumeIds);
    for (const row of owned ?? []) ownedVolumeIds.add(row.volume_id);
  }

  return buildSeriesDetail(toSeries(seriesRow), volumes, ownedVolumeIds);
}
