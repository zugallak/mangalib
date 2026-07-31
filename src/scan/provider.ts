import "server-only";

import type { ScanProvider } from "@/domain/scan";
import { stubScanProvider } from "@/scan/stub-provider";

/**
 * Provider registry / selection point.
 *
 * For the MVP this always returns the stub (no real AI). When a real provider
 * is added, wire it here (e.g. keyed off an env var) — callers never change.
 */
export function getScanProvider(): ScanProvider {
  return stubScanProvider;
}
