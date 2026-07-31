/**
 * Pure normalization of raw provider detections into app-level detections.
 * No I/O. This is the last line of defense against malformed model output
 * before anything reaches the UI or the database.
 *
 * Responsibilities:
 *  - clamp confidence into [0, 1]
 *  - reject impossible volume numbers (negative / non-integer) → null
 *  - drop detections with an empty series title
 *  - deduplicate obvious exact duplicates (same series + volume + publisher)
 *  - assign stable, deterministic ids
 */

import type { MangaDetection, RawMangaDetection } from "@/domain/scan";
import { normalizeTitle } from "@/domain/catalog";

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Volume numbers must be positive integers; anything else is "unknown". */
function cleanVolumeNumber(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value)) return null;
  if (value < 1) return null;
  return value;
}

function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Dedup key. Only detections with a known volume number are considered for
 * merging — two "Bleach / unknown" spines may be genuinely different volumes,
 * so we keep them separate. Publisher is part of the key so distinct editions
 * are never merged.
 */
function dedupeKey(seriesTitle: string, volumeNumber: number, publisher: string | null): string {
  return `${normalizeTitle(seriesTitle)}#${volumeNumber}#${normalizeTitle(publisher ?? "")}`;
}

export function normalizeDetections(raw: readonly RawMangaDetection[]): MangaDetection[] {
  const seen = new Set<string>();
  const result: MangaDetection[] = [];

  for (const d of raw) {
    const seriesTitle = cleanText(d.seriesTitle);
    if (!seriesTitle) continue; // empty title → unusable

    const volumeNumber = cleanVolumeNumber(d.volumeNumber);
    const publisher = cleanText(d.publisher);

    if (volumeNumber !== null) {
      const key = dedupeKey(seriesTitle, volumeNumber, publisher);
      if (seen.has(key)) continue; // exact duplicate — keep the first
      seen.add(key);
    }

    result.push({
      id: `det-${result.length}`,
      seriesTitle,
      volumeNumber,
      publisher,
      editionHint: cleanText(d.editionHint),
      confidence: clampConfidence(d.confidence),
      rawLabel: cleanText(d.rawLabel),
      notes: cleanText(d.notes),
    });
  }

  return result;
}
