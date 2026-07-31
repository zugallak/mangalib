import "server-only";

import { buildSeriesDetail, summarizeSeries } from "@/domain/library";
import type { SeriesSummary, Volume } from "@/domain/types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { toSeries, toVolume } from "@/data/mappers";

/**
 * Load the current user's library as a list of series summaries.
 *
 * Uses small, flat queries (rather than deep embeds) so every result is
 * precisely typed and the assembly logic lives in the pure domain layer.
 * Row Level Security scopes `owned_volume` to the signed-in user; the catalog
 * tables are readable by any authenticated user.
 *
 * Returns [] when Supabase is not configured or nobody is signed in, so the
 * UI can render an empty / setup state instead of erroring.
 */
export async function getLibrarySummaries(): Promise<SeriesSummary[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 1. What the user owns (flat list of volume ids). Ownership is boolean.
  const { data: owned } = await supabase
    .from("owned_volume")
    .select("volume_id")
    .eq("user_id", user.id);

  if (!owned || owned.length === 0) return [];

  const ownedVolumeIds = new Set<string>(owned.map((row) => row.volume_id));

  // 2. Owned volumes → their editions → their series.
  const { data: ownedVolumes } = await supabase
    .from("volume")
    .select("id, edition_id")
    .in("id", [...ownedVolumeIds]);
  if (!ownedVolumes || ownedVolumes.length === 0) return [];

  const ownedEditionIds = unique(ownedVolumes.map((v) => v.edition_id));
  const { data: ownedEditions } = await supabase
    .from("edition")
    .select("id, series_id")
    .in("id", ownedEditionIds);
  if (!ownedEditions || ownedEditions.length === 0) return [];

  const seriesIds = unique(ownedEditions.map((e) => e.series_id));

  // 3. Expand to the FULL catalog for those series so we can compute totals
  //    and which volumes are missing.
  const { data: allEditions } = await supabase
    .from("edition")
    .select("id, series_id")
    .in("series_id", seriesIds);
  if (!allEditions) return [];

  const seriesIdByEditionId = new Map<string, string>();
  for (const e of allEditions) seriesIdByEditionId.set(e.id, e.series_id);

  const { data: allVolumeRows } = await supabase
    .from("volume")
    .select("id, edition_id, volume_number, isbn, title, cover_url")
    .in("edition_id", [...seriesIdByEditionId.keys()]);
  if (!allVolumeRows) return [];

  const { data: seriesRows } = await supabase
    .from("series")
    .select("id, title, original_title")
    .in("id", seriesIds);
  if (!seriesRows) return [];

  // 4. Group volumes by series and assemble via pure domain logic.
  const volumesBySeriesId = new Map<string, Volume[]>();
  for (const row of allVolumeRows) {
    const seriesId = seriesIdByEditionId.get(row.edition_id);
    if (!seriesId) continue;
    const list = volumesBySeriesId.get(seriesId) ?? [];
    list.push(toVolume(row));
    volumesBySeriesId.set(seriesId, list);
  }

  const summaries = seriesRows.map((seriesRow) => {
    const series = toSeries(seriesRow);
    const volumes = volumesBySeriesId.get(series.id) ?? [];
    const detail = buildSeriesDetail(series, volumes, ownedVolumeIds);
    return summarizeSeries(detail);
  });

  return summaries.sort((a, b) => a.series.title.localeCompare(b.series.title));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
