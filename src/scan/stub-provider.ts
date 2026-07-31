import "server-only";

import type { ScanProvider, ScanResult } from "@/domain/scan";

/**
 * Placeholder scan provider for the MVP.
 *
 * It does NOT call any AI model. It exists so the rest of the pipeline
 * (upload → analyze → review → validate → import) can be built and typed
 * against a real interface. When a multimodal provider is added it will
 * replace this behind the same `ScanProvider` contract.
 */
export const stubScanProvider: ScanProvider = {
  name: "stub",
  // Parameter intentionally omitted — the stub ignores the image.
  async analyze(): Promise<ScanResult> {
    return {
      provider: "stub",
      detections: [],
    };
  },
};
