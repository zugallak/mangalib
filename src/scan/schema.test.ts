import { describe, expect, it } from "vitest";

import { scanResponseSchema } from "@/scan/schema";

describe("scanResponseSchema", () => {
  it("accepts a well-formed response", () => {
    const parsed = scanResponseSchema.safeParse({
      detections: [
        {
          seriesTitle: "Bleach",
          volumeNumber: 12,
          publisher: null,
          editionHint: null,
          confidence: 0.9,
          rawLabel: "BLEACH 12",
          notes: null,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed output (missing detections array)", () => {
    expect(scanResponseSchema.safeParse({}).success).toBe(false);
    expect(scanResponseSchema.safeParse({ detections: "nope" }).success).toBe(false);
  });

  it("rejects a detection with a non-numeric confidence", () => {
    const parsed = scanResponseSchema.safeParse({
      detections: [
        {
          seriesTitle: "Bleach",
          volumeNumber: 12,
          publisher: null,
          editionHint: null,
          confidence: "high",
          rawLabel: null,
          notes: null,
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
