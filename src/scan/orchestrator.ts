import type { MangaScanResult, ScanInput, ScanProvider } from "@/domain/scan";
import { ScanTechnicalError, ScanUnavailableError, isScanTechnicalError } from "@/scan/errors";
import { normalizeDetections } from "@/scan/normalize";
import type { ScanLogger } from "@/scan/logger";

/**
 * Scan orchestration: primary provider (Gemini), technical fallback (OpenAI).
 *
 * Fallback fires ONLY when the primary throws a ScanTechnicalError (network,
 * timeout, rate-limit, invalid/unparseable response, technical refusal). A
 * valid-but-empty or partial primary result is a success and is returned
 * as-is — we never pay for a second multimodal call because confidence was low
 * or some spines went unread.
 *
 * Pure over injected dependencies (no SDK imports) so the fallback logic is
 * unit-testable with fake providers.
 */
export interface RunScanDeps {
  primary: ScanProvider;
  fallback: ScanProvider;
  logger: ScanLogger;
  now: () => number;
}

export async function runScan(input: ScanInput, deps: RunScanDeps): Promise<MangaScanResult> {
  const { primary, fallback, logger, now } = deps;

  const primaryStart = now();
  try {
    const detections = normalizeDetections(await primary.analyze(input));
    logger({
      provider: primary.name,
      success: true,
      fallbackTriggered: false,
      latencyMs: Math.round(now() - primaryStart),
      detectionCount: detections.length,
    });
    return { provider: primary.name, detections };
  } catch (primaryErr) {
    // Only technical failures are eligible for fallback.
    if (!isScanTechnicalError(primaryErr)) {
      logger({
        provider: primary.name,
        success: false,
        fallbackTriggered: false,
        latencyMs: Math.round(now() - primaryStart),
        errorCategory: "non_technical",
      });
      throw primaryErr;
    }
    const primaryTechnical = primaryErr as ScanTechnicalError;
    logger({
      provider: primary.name,
      success: false,
      fallbackTriggered: true,
      latencyMs: Math.round(now() - primaryStart),
      errorCategory: primaryTechnical.category,
      errorStatus: primaryTechnical.status,
      errorCode: primaryTechnical.code,
      errorDetail: primaryTechnical.message,
    });

    const fallbackStart = now();
    try {
      const detections = normalizeDetections(await fallback.analyze(input));
      logger({
        provider: fallback.name,
        success: true,
        fallbackTriggered: true,
        latencyMs: Math.round(now() - fallbackStart),
        detectionCount: detections.length,
      });
      return { provider: fallback.name, detections };
    } catch (fallbackErr) {
      const fallbackTechnical = isScanTechnicalError(fallbackErr) ? fallbackErr : null;
      logger({
        provider: fallback.name,
        success: false,
        fallbackTriggered: true,
        latencyMs: Math.round(now() - fallbackStart),
        errorCategory: fallbackTechnical?.category ?? "unknown",
        errorStatus: fallbackTechnical?.status,
        errorCode: fallbackTechnical?.code,
        errorDetail: fallbackTechnical?.message,
      });
      throw new ScanUnavailableError();
    }
  }
}
