/**
 * Scan domain: the abstraction between "an image of a bookshelf" and
 * "structured manga detections the user can review".
 *
 * Provider-agnostic. Gemini / OpenAI implementations satisfy `ScanProvider`
 * without the rest of the app knowing which model produced the results.
 *
 * Hard rule enforced by the workflow (not this type): detections are ALWAYS
 * reviewed and validated by the user before anything is written to their
 * library.
 */

/** Which backend produced a scan result (useful for debugging / subtle UI). */
export type ScanProviderName = "gemini" | "openai";

/**
 * A single manga volume as returned by a provider, BEFORE app-side
 * normalization. No id yet — ids are assigned during normalization so the
 * review UI has stable keys.
 */
export interface RawMangaDetection {
  seriesTitle: string;
  /** Detected volume number, or null when unreadable / ambiguous. */
  volumeNumber: number | null;
  /** Publisher / imprint when identifiable (logo, edition styling). */
  publisher?: string | null;
  /** Free-text edition hint (e.g. "Perfect Edition", "Omnibus"). */
  editionHint?: string | null;
  /** Model confidence in [0, 1]. */
  confidence: number;
  /** Raw text the model read off the spine, for debugging & review. */
  rawLabel?: string | null;
  /** Model notes, e.g. "volume inferred from surrounding sequence". */
  notes?: string | null;
}

/**
 * A normalized detection presented to the user for review. Same shape as the
 * raw one plus a stable `id`.
 */
export interface MangaDetection extends RawMangaDetection {
  id: string;
}

/** The single app-level scan result. UI never sees provider-specific shapes. */
export interface MangaScanResult {
  provider: ScanProviderName;
  detections: MangaDetection[];
}

/** Bytes + mime handed to a provider. */
export interface ScanInput {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * The single seam every recognition backend implements. Providers return raw
 * detections (or throw a ScanTechnicalError); normalization and fallback are
 * handled by the orchestrator, not here.
 */
export interface ScanProvider {
  readonly name: ScanProviderName;
  analyze(input: ScanInput): Promise<RawMangaDetection[]>;
}

// ---------------------------------------------------------------------------
// Confidence buckets — one consistent meaning across providers (range 0..1).
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "high" | "medium" | "low";

export const HIGH_CONFIDENCE_THRESHOLD = 0.85;
export const MEDIUM_CONFIDENCE_THRESHOLD = 0.6;

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return "high";
  if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) return "medium";
  return "low";
}
