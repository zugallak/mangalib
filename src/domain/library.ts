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

  // Same consistency guard as buildSeriesDetail: don't claim completeness when
  // known volumes exceed a stale authoritative total.
  const known = new Set<number>([...owned, ...toNumberSet(input.catalogVolumeNumbers)]);
  const knownMax = known.size > 0 ? Math.max(...known) : null;
  const consistentTotal = total === null || knownMax === null || knownMax <= total;

  const isComplete =
    total !== null && consistentTotal && ownedWithinTotal(owned, total) === total;
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
 * Defensive cap on how many contiguous tiles the grid will generate. Real
 * manga series stay well under this (the longest run into the low hundreds of
 * volumes), so this only trips on bad imported data (e.g. a mistaken volume
 * number like 99999). Beyond the cap we degrade to showing just the known
 * numbers rather than rendering thousands of placeholder tiles.
 */
export const MAX_DISPLAY_VOLUMES = 1000;

/**
 * Build the series detail (logical volume grid), filling gaps in the numeric
 * sequence with DISPLAY-ONLY placeholders so the user can see holes.
 *
 *  - Known total   → range 1..total; unowned tiles are authoritatively missing.
 *  - Unknown total → range 1..knownMax (highest owned/catalogued number);
 *    unowned tiles are only GAPS in the known range. knownMax is NEVER treated
 *    as the series total, so completeness is never implied.
 *
 * Placeholder tiles do not correspond to catalog rows and are never persisted.
 */
export function buildSeriesDetail(input: SeriesLogicalInput): SeriesDetail {
  const owned = toNumberSet(input.ownedVolumeNumbers);
  const catalog = toNumberSet(input.catalogVolumeNumbers);
  const total = input.totalVolumes;

  const known = new Set<number>([...owned, ...catalog]);
  const knownMaxVolume = known.size > 0 ? Math.max(...known) : null;

  // Upper bound of the contiguous display range. Always covers known data:
  // if stale/inconsistent metadata says total=8 but volume 9 is owned/known,
  // we still render through 9 rather than hiding it.
  const upper = Math.max(total ?? 0, knownMaxVolume ?? 0);

  let numbers: number[];
  if (upper > MAX_DISPLAY_VOLUMES) {
    // Bad data: don't fabricate a huge range — show only the known numbers.
    numbers = [...known].sort((a, b) => a - b);
  } else {
    numbers = Array.from({ length: upper }, (_, i) => i + 1);
  }

  const volumes: VolumeWithOwnership[] = numbers.map((volumeNumber) => {
    const isOwned = owned.has(volumeNumber);
    return {
      volumeNumber,
      owned: isOwned,
      knownCatalogVolume: isOwned || catalog.has(volumeNumber),
      status: isOwned ? "owned" : "missing",
    };
  });

  // Completeness requires a known total that is CONSISTENT with the data: if
  // known volumes exceed the authoritative total, the metadata is stale and we
  // never claim completeness (nor promote knownMax to the new total).
  const consistentTotal =
    total === null || knownMaxVolume === null || knownMaxVolume <= total;
  const isComplete =
    total !== null && consistentTotal && ownedWithinTotal(owned, total) === total;
  const missingInRange = volumes.reduce((n, v) => (v.owned ? n : n + 1), 0);

  return {
    series: input.series,
    volumes,
    ownedCount: owned.size,
    totalVolumes: total,
    knownMaxVolume,
    missingInRange,
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
