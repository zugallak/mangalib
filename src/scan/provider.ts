import "server-only";

import type { MangaScanResult, ScanInput } from "@/domain/scan";
import { runScan } from "@/scan/orchestrator";
import { geminiScanProvider } from "@/scan/gemini-provider";
import { openaiScanProvider } from "@/scan/openai-provider";
import { consoleScanLogger } from "@/scan/logger";

/** Public scan entry point wired to the real providers (Gemini → OpenAI). */
export function scanImage(input: ScanInput): Promise<MangaScanResult> {
  return runScan(input, {
    primary: geminiScanProvider,
    fallback: openaiScanProvider,
    logger: consoleScanLogger,
    now: () => Date.now(),
  });
}
