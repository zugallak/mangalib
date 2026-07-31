/**
 * Pure domain logic for turning catalog volumes + user ownership into the
 * view models the UI renders. No I/O, no framework — trivially testable.
 *
 * Ownership is a boolean relationship (a volume id is owned or it is not),
 * represented as a Set of owned volume ids.
 */

import type {
  SeriesDetail,
  SeriesSummary,
  Series,
  Volume,
  VolumeWithOwnership,
} from "@/domain/types";

/**
 * Merge the catalog volumes of a series with the set of volume ids the user
 * owns into an ordered, ownership-annotated list.
 */
export function buildSeriesDetail(
  series: Series,
  volumes: Volume[],
  ownedVolumeIds: ReadonlySet<string>,
): SeriesDetail {
  const ordered = [...volumes].sort((a, b) => a.volumeNumber - b.volumeNumber);

  const withOwnership: VolumeWithOwnership[] = ordered.map((volume) => {
    const owned = ownedVolumeIds.has(volume.id);
    return { volume, owned, status: owned ? "owned" : "missing" };
  });

  const ownedCount = withOwnership.filter((v) => v.owned).length;

  return {
    series,
    volumes: withOwnership,
    ownedCount,
    totalCount: withOwnership.length,
  };
}

/** Collapse a series' volume ownership into the library-overview summary. */
export function summarizeSeries(detail: SeriesDetail): SeriesSummary {
  return {
    series: detail.series,
    ownedCount: detail.ownedCount,
    totalCount: detail.totalCount,
    missingCount: detail.totalCount - detail.ownedCount,
  };
}

// ---------------------------------------------------------------------------
// Scan-support helpers (pure). These let the future scan review flow reason
// about ownership without any I/O. Not wired to UI yet.
// ---------------------------------------------------------------------------

/** Remove duplicate volume ids while preserving first-seen order. */
export function dedupeVolumeIds(volumeIds: readonly string[]): string[] {
  return [...new Set(volumeIds)];
}

/**
 * Split a set of detected/candidate volume ids into those the user already
 * owns and those that are new. Input is deduplicated first, so the result is
 * safe to feed straight into an idempotent add.
 *
 * Example: detected [12, 13, 14], owned {12, 13} → { alreadyOwned: [12, 13],
 * toAdd: [14] }.
 */
export function partitionByOwnership(
  candidateVolumeIds: readonly string[],
  ownedVolumeIds: ReadonlySet<string>,
): { alreadyOwned: string[]; toAdd: string[] } {
  const alreadyOwned: string[] = [];
  const toAdd: string[] = [];

  for (const id of dedupeVolumeIds(candidateVolumeIds)) {
    if (ownedVolumeIds.has(id)) alreadyOwned.push(id);
    else toAdd.push(id);
  }

  return { alreadyOwned, toAdd };
}
