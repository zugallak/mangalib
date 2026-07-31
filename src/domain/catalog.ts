/**
 * Pure catalog helpers: title normalization and the per-detection resolution
 * model used by the scan review screen. No I/O.
 */

/**
 * Normalize a series title for comparison/matching: lowercase, strip accents,
 * collapse whitespace and drop surrounding punctuation. Used to decide whether
 * "BLEACH" and "Bleach" refer to the same series. The DB has a matching
 * `lower(title)` index; keep this consistent with that where possible.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolution state of a reviewed detection against the shared catalog +
 * the user's ownership.
 *
 * - owned        : catalog volume exists and the user already owns it
 * - new          : will be added (either exists in catalog & unowned, or the
 *                   volume/series will be created on import)
 * - ambiguous    : multiple distinct catalog matches — needs user attention
 * - incomplete   : not enough info to resolve (no title or null volume number)
 */
/** A reviewed detection reduced to the fields catalog resolution needs. */
export interface ResolvableDetection {
  detectionId: string;
  seriesTitle: string;
  volumeNumber: number | null;
  publisher: string | null;
}

export type ResolutionStatus = "owned" | "new" | "ambiguous" | "incomplete";

export interface DetectionResolution {
  detectionId: string;
  status: ResolutionStatus;
  /** Present when a single catalog volume was matched. */
  volumeId?: string | null;
}

export interface ResolutionSummary {
  total: number;
  owned: number;
  /** Detections that will produce a new owned row on import. */
  toAdd: number;
  /** Detections needing user attention (ambiguous or incomplete). */
  needsReview: number;
}

export function summarizeResolutions(
  resolutions: readonly DetectionResolution[],
): ResolutionSummary {
  let owned = 0;
  let toAdd = 0;
  let needsReview = 0;

  for (const r of resolutions) {
    if (r.status === "owned") owned += 1;
    else if (r.status === "new") toAdd += 1;
    else needsReview += 1; // ambiguous | incomplete
  }

  return { total: resolutions.length, owned, toAdd, needsReview };
}

/** A detection is importable only if it has a title and a volume number. */
export function isImportable(detection: {
  seriesTitle: string;
  volumeNumber: number | null;
}): boolean {
  return detection.seriesTitle.trim().length > 0 && detection.volumeNumber !== null;
}
