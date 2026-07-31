/**
 * Pure domain logic for turning owned/known logical volumes + an authoritative
 * total into truthful library view models. No I/O, no framework.
 *
 * Everything here operates on LOGICAL volume numbers (deduplicated), never on
 * raw catalog rows — so duplicate catalog data can never inflate counts or fake
 * completeness. Completeness is asserted ONLY when an authoritative total is
 * known AND the owned numbers cover the full 1..total set.
 */

import type {
  SeriesDetail,
  SeriesSummary,
  Series,
  VolumeWithOwnership,
} from "@/domain/types";

/** Distinct positive numbers as a set. */
function toNumberSet(numbers: Iterable<number>): Set<number> {
  const set = new Set<number>();
  for (const n of numbers) if (Number.isInteger(n) && n > 0) set.add(n);
  return set;
}

/** How many owned numbers fall within the authoritative 1..total range. */
function ownedWithinTotal(owned: ReadonlySet<number>, total: number): number {
  let count = 0;
  for (const n of owned) if (n >= 1 && n <= total) count += 1;
  return count;
}

export interface SeriesLogicalInput {
  series: Series;
  /** Volume numbers the user owns (may contain duplicates; deduped here). */
  ownedVolumeNumbers: Iterable<number>;
  /** All volume numbers known to the catalog for this logical series. */
  catalogVolumeNumbers: Iterable<number>;
  /** Authoritative published count, or null when unknown. */
  totalVolumes: number | null;
}

/** Library-overview summary. Never claims completeness without a known total. */
export function summarizeSeries(input: SeriesLogicalInput): SeriesSummary {
  const owned = toNumberSet(input.ownedVolumeNumbers);
  const total = input.totalVolumes;

  const isComplete = total !== null && ownedWithinTotal(owned, total) === total;
  const missingCount = total !== null ? total - ownedWithinTotal(owned, total) : null;

  return {
    series: input.series,
    ownedCount: owned.size,
    totalVolumes: total,
    missingCount,
    isComplete,
  };
}

/**
 * Build the series detail (logical volume grid).
 *  - Known total  → show 1..total, owned/missing.
 *  - Unknown total → show only the known/owned numbers (no fabricated missing
 *    slots, no implied completeness).
 */
export function buildSeriesDetail(input: SeriesLogicalInput): SeriesDetail {
  const owned = toNumberSet(input.ownedVolumeNumbers);
  const total = input.totalVolumes;

  let numbers: number[];
  if (total !== null) {
    numbers = Array.from({ length: total }, (_, i) => i + 1);
  } else {
    numbers = [...toNumberSet([...input.catalogVolumeNumbers, ...owned])].sort(
      (a, b) => a - b,
    );
  }

  const volumes: VolumeWithOwnership[] = numbers.map((volumeNumber) => {
    const isOwned = owned.has(volumeNumber);
    return { volumeNumber, owned: isOwned, status: isOwned ? "owned" : "missing" };
  });

  const isComplete = total !== null && ownedWithinTotal(owned, total) === total;

  return {
    series: input.series,
    volumes,
    ownedCount: owned.size,
    totalVolumes: total,
    isComplete,
  };
}

// ---------------------------------------------------------------------------
// Scan-support helpers (pure) — used by the import flow.
// ---------------------------------------------------------------------------

/** Remove duplicate volume ids while preserving first-seen order. */
export function dedupeVolumeIds(volumeIds: readonly string[]): string[] {
  return [...new Set(volumeIds)];
}

/**
 * Split candidate volume ids into those the user already owns and those that
 * are new. Input is deduplicated first, so the result is safe to feed straight
 * into an idempotent add.
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
