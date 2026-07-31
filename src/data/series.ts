import "server-only";

import { seriesMatchKey } from "@/domain/catalog";
import { buildSeriesDetail } from "@/domain/library";
import type { SeriesDetail } from "@/domain/types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Load one logical series with its volume list, annotated with the current
 * user's ownership. Sibling series sharing the same match key (duplicate
 * catalog rows) are merged, volumes are deduplicated by number, and
 * completeness is truthful (only when an authoritative total is known).
 */
export async function getSeriesDetail(seriesId: string): Promise<SeriesDetail | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();

  const { data: seriesRow } = await supabase
    .from("series")
    .select("id, title")
    .eq("id", seriesId)
    .maybeSingle();
  if (!seriesRow) return null;

  const key = seriesMatchKey(seriesRow.title);

  // Merge sibling duplicate series (same match key).
  const { data: allSeries } = await supabase.from("series").select("id, title");
  const siblingIds = (allSeries ?? [])
    .filter((s) => seriesMatchKey(s.title) === key)
    .map((s) => s.id);
  const seriesIds = siblingIds.length > 0 ? siblingIds : [seriesRow.id];

  const { data: editions } = await supabase
    .from("edition")
    .select("id, total_volumes")
    .in("series_id", seriesIds);

  const editionIds = (editions ?? []).map((e) => e.id);
  const totalVolumes =
    (editions ?? []).map((e) => e.total_volumes).find((t) => t != null) ?? null;

  const catalogNumbers: number[] = [];
  const ownedVolumeNumbers: number[] = [];

  if (editionIds.length > 0) {
    const { data: volumeRows } = await supabase
      .from("volume")
      .select("id, volume_number")
      .in("edition_id", editionIds);

    const numberByVolumeId = new Map<string, number>();
    for (const v of volumeRows ?? []) {
      numberByVolumeId.set(v.id, v.volume_number);
      catalogNumbers.push(v.volume_number);
    }

    const volumeIds = [...numberByVolumeId.keys()];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && volumeIds.length > 0) {
      const { data: owned } = await supabase
        .from("owned_volume")
        .select("volume_id")
        .in("volume_id", volumeIds);
      for (const o of owned ?? []) {
        const n = numberByVolumeId.get(o.volume_id);
        if (n !== undefined) ownedVolumeNumbers.push(n);
      }
    }
  }

  return buildSeriesDetail({
    series: { id: seriesRow.id, title: seriesRow.title, originalTitle: null },
    ownedVolumeNumbers,
    catalogVolumeNumbers: catalogNumbers,
    totalVolumes,
  });
}
