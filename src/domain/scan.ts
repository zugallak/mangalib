/**
 * Scan domain: the abstraction between "an image of a bookshelf" and
 * "structured manga detections the user can review".
 *
 * This layer is deliberately provider-agnostic. A future OpenAI / Gemini /
 * Claude implementation must satisfy `ScanProvider` without the rest of the
 * app knowing which model produced the results.
 *
 * Hard rule enforced by the workflow (not this type): detections are ALWAYS
 * reviewed and validated by the user before anything is written to their
 * library.
 */

/**
 * A single manga volume detected in a photo. Everything the model is unsure
 * about is nullable so the review screen can flag it for correction.
 */
export interface MangaDetection {
  /** Best-guess series title, e.g. "Bleach". */
  seriesTitle: string;
  /** Detected volume number, or null when unreadable / ambiguous. */
  volumeNumber: number | null;
  /** Publisher / imprint when identifiable (logo, edition styling). */
  publisher?: string | null;
  /** Model confidence in [0, 1]. */
  confidence: number;
  /** Raw text/label the model read off the spine, for debugging & review. */
  rawLabel?: string;
  /**
   * Optional sequence-based suggestion. When surrounding volumes imply a
   * likely number for an unreadable spine (…21, 22, ?, 24 → 23), the provider
   * MAY surface it here. It is a suggestion only and must never be silently
   * treated as fact — the review UI presents it as such.
   */
  suggestedVolumeNumber?: number | null;
}

export interface ScanRequest {
  /** The bookshelf image to analyse. */
  image: Blob | ArrayBuffer;
  /** Optional MIME type hint (e.g. "image/jpeg"). */
  mimeType?: string;
}

export interface ScanResult {
  detections: MangaDetection[];
  /** Identifier of the provider that produced the result. */
  provider: string;
}

/**
 * The single seam every recognition backend implements. Swapping providers
 * means adding one file — no change to the review, matching or library code.
 */
export interface ScanProvider {
  readonly name: string;
  analyze(request: ScanRequest): Promise<ScanResult>;
}

/** Confidence below this should be visually flagged for user attention. */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export function isLowConfidence(detection: MangaDetection): boolean {
  return detection.confidence < LOW_CONFIDENCE_THRESHOLD;
}
