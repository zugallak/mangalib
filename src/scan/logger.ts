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
}

export type ScanLogger = (event: ScanLogEvent) => void;

export const consoleScanLogger: ScanLogger = (event) => {
  // Single structured line; safe fields only.
  console.info("[scan]", JSON.stringify(event));
};
