import "server-only";

/**
 * Minimal server-side scan telemetry. Logs non-sensitive metadata only.
 * NEVER logs API keys, image bytes/base64, or provider credentials.
 */
export interface ScanLogEvent {
  provider: "gemini" | "openai";
  success: boolean;
  fallbackTriggered: boolean;
  latencyMs: number;
  detectionCount?: number;
  errorCategory?: string;
  /** HTTP status when the failure was an API response. */
  errorStatus?: number;
  /** SDK/API error code (e.g. "insufficient_quota", "ENOTFOUND", "NOT_FOUND"). */
  errorCode?: string;
  /** Short, sanitized reason — never contains keys, request bodies or images. */
  errorDetail?: string;
}

export type ScanLogger = (event: ScanLogEvent) => void;

export const consoleScanLogger: ScanLogger = (event) => {
  // Single structured line; safe fields only.
  console.info("[scan]", JSON.stringify(event));
};
