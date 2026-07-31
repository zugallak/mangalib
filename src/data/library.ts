import "server-only";

import { seriesMatchKey } from "@/domain/catalog";
import { summarizeSeries } from "@/domain/library";
import type { SeriesSummary } from "@/domain/types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Load the current user's library as truthful, duplicate-tolerant summaries.
 *
 * Series are grouped by seriesMatchKey so duplicate catalog rows ("XXX Holic"
 * vs "XXXHolic") collapse into ONE logical series. Ownership counts DISTINCT
 * volume numbers, so duplicate catalog volume rows never inflate the count.
 * Completeness is only asserted when an edition has an authoritative
 * total_volumes.
 */
export async function getLibrarySummaries(): Promise<SeriesSummary[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: owned } = await supabase
    .from("owned_volume")
    .select("volume_id")
    .eq("user_id", user.id);
  if (!owned || owned.length === 0) return [];

  const ownedIds = new Set(owned.map((o) => o.volume_id));

  const { data: ownedVolumes } = await supabase
    .from("volume")
    .select("id, edition_id, volume_number")
    .in("id", [...ownedIds]);
  if (!ownedVolumes || ownedVolumes.length === 0) return [];

  const ownedEditionIds = unique(ownedVolumes.map((v) => v.edition_id));
  const { data: ownedEditions } = await supabase
    .from("edition")
    .select("id, series_id")
    .in("id", ownedEditionIds);
  if (!ownedEditions || ownedEditions.length === 0) return [];

  const seriesIdByEdition = new Map(ownedEditions.map((e) => [e.id, e.series_id]));

  // All series → group duplicates by match key (find siblings of owned series).
  const { data: allSeries } = await supabase.from("series").select("id, title");
  const titleById = new Map((allSeries ?? []).map((s) => [s.id, s.title]));
  const keyOfSeries = (seriesId: string) => seriesMatchKey(titleById.get(seriesId) ?? "");

  // Owned distinct volume numbers per logical key + per-series owned counts.
  const ownedNumbersByKey = new Map<string, Set<number>>();
  const ownedCountBySeries = new Map<string, number>();
  for (const v of ownedVolumes) {
    const seriesId = seriesIdByEdition.get(v.edition_id);
    if (!seriesId) continue;
    const key = keyOfSeries(seriesId);
    if (!key) continue;
    const set = ownedNumbersByKey.get(key) ?? new Set<number>();
    set.add(v.volume_number);
    ownedNumbersByKey.set(key, set);
    ownedCountBySeries.set(seriesId, (ownedCountBySeries.get(seriesId) ?? 0) + 1);
  }

  // Sibling series ids per logical key.
  const seriesIdsByKey = new Map<string, string[]>();
  for (const s of allSeries ?? []) {
    const key = seriesMatchKey(s.title);
    if (!ownedNumbersByKey.has(key)) continue;
    const arr = seriesIdsByKey.get(key) ?? [];
    arr.push(s.id);
    seriesIdsByKey.set(key, arr);
  }

  // Authoritative total per key (first non-null across sibling editions).
  const totalByKey = new Map<string, number>();
  const allSiblingSeriesIds = [...seriesIdsByKey.values()].flat();
  if (allSiblingSeriesIds.length > 0) {
    const { data: siblingEditions } = await supabase
      .from("edition")
      .select("series_id, total_volumes")
      .in("series_id", allSiblingSeriesIds);
    for (const e of siblingEditions ?? []) {
      const key = keyOfSeries(e.series_id);
      if (e.total_volumes != null && !totalByKey.has(key)) totalByKey.set(key, e.total_volumes);
    }
  }

  const summaries: SeriesSummary[] = [...ownedNumbersByKey.entries()].map(([key, numbers]) => {
    const seriesIds = seriesIdsByKey.get(key) ?? [];
    // Canonical display = the series with the most owned volumes (tie → first).
    const canonicalId =
      [...seriesIds].sort(
        (a, b) => (ownedCountBySeries.get(b) ?? 0) - (ownedCountBySeries.get(a) ?? 0),
      )[0] ?? seriesIds[0];

    const numberList = [...numbers];
    return summarizeSeries({
      series: { id: canonicalId, title: titleById.get(canonicalId) ?? "", originalTitle: null },
      ownedVolumeNumbers: numberList,
      catalogVolumeNumbers: numberList,
      totalVolumes: totalByKey.get(key) ?? null,
    });
  });

  return summaries.sort((a, b) => a.series.title.localeCompare(b.series.title));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
