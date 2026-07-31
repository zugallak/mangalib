import { describe, expect, it, vi } from "vitest";

import { runScan, type RunScanDeps } from "@/scan/orchestrator";
import { ScanTechnicalError, ScanUnavailableError } from "@/scan/errors";
import type { RawMangaDetection, ScanInput, ScanProvider } from "@/domain/scan";

const INPUT: ScanInput = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };

function provider(
  name: "gemini" | "openai",
  impl: () => Promise<RawMangaDetection[]>,
): ScanProvider {
  return { name, analyze: impl };
}

function deps(primary: ScanProvider, fallback: ScanProvider): RunScanDeps {
  return { primary, fallback, logger: vi.fn(), now: () => 0 };
}

const oneDetection: RawMangaDetection[] = [
  {
    seriesTitle: "Bleach",
    volumeNumber: 12,
    publisher: null,
    editionHint: null,
    confidence: 0.9,
    rawLabel: null,
    notes: null,
  },
];

describe("runScan fallback rules", () => {
  it("returns the primary result and does NOT call fallback on success", async () => {
    const fallback = vi.fn(async () => oneDetection);
    const result = await runScan(
      INPUT,
      deps(
        provider("gemini", async () => oneDetection),
        provider("openai", fallback),
      ),
    );
    expect(result.provider).toBe("gemini");
    expect(result.detections).toHaveLength(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("treats a valid empty result as success (no fallback)", async () => {
    const fallback = vi.fn(async () => oneDetection);
    const result = await runScan(
      INPUT,
      deps(
        provider("gemini", async () => []),
        provider("openai", fallback),
      ),
    );
    expect(result.provider).toBe("gemini");
    expect(result.detections).toHaveLength(0);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when the primary throws a technical error", async () => {
    const result = await runScan(
      INPUT,
      deps(
        provider("gemini", async () => {
          throw new ScanTechnicalError("gemini", "timeout", "boom");
        }),
        provider("openai", async () => oneDetection),
      ),
    );
    expect(result.provider).toBe("openai");
    expect(result.detections).toHaveLength(1);
  });

  it("does NOT fall back on a non-technical error — it rethrows", async () => {
    const fallback = vi.fn(async () => oneDetection);
    await expect(
      runScan(
        INPUT,
        deps(
          provider("gemini", async () => {
            throw new Error("bug in our code");
          }),
          provider("openai", fallback),
        ),
      ),
    ).rejects.toThrow("bug in our code");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("throws ScanUnavailableError when both providers fail technically", async () => {
    await expect(
      runScan(
        INPUT,
        deps(
          provider("gemini", async () => {
            throw new ScanTechnicalError("gemini", "network", "down");
          }),
          provider("openai", async () => {
            throw new ScanTechnicalError("openai", "network", "down");
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ScanUnavailableError);
  });
});
