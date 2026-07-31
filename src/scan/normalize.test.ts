import { describe, expect, it } from "vitest";

import { normalizeDetections } from "@/scan/normalize";
import type { RawMangaDetection } from "@/domain/scan";

function raw(partial: Partial<RawMangaDetection>): RawMangaDetection {
  return {
    seriesTitle: "Bleach",
    volumeNumber: 1,
    publisher: null,
    editionHint: null,
    confidence: 0.9,
    rawLabel: null,
    notes: null,
    ...partial,
  };
}

describe("normalizeDetections", () => {
  it("clamps confidence into [0,1] and handles non-finite", () => {
    const out = normalizeDetections([
      raw({ volumeNumber: 1, confidence: 1.7 }),
      raw({ volumeNumber: 2, confidence: -0.5 }),
      raw({ volumeNumber: 3, confidence: Number.NaN }),
    ]);
    expect(out.map((d) => d.confidence)).toEqual([1, 0, 0]);
  });

  it("drops detections with an empty/whitespace series title", () => {
    const out = normalizeDetections([raw({ seriesTitle: "   " }), raw({ seriesTitle: "Naruto" })]);
    expect(out).toHaveLength(1);
    expect(out[0].seriesTitle).toBe("Naruto");
  });

  it("rejects impossible volume numbers by setting them to null", () => {
    const out = normalizeDetections([
      raw({ seriesTitle: "A", volumeNumber: -3 }),
      raw({ seriesTitle: "B", volumeNumber: 2.5 }),
      raw({ seriesTitle: "C", volumeNumber: 0 }),
    ]);
    expect(out.map((d) => d.volumeNumber)).toEqual([null, null, null]);
  });

  it("deduplicates exact duplicates ignoring case/accents in the title", () => {
    const out = normalizeDetections([
      raw({ seriesTitle: "Bleach", volumeNumber: 12 }),
      raw({ seriesTitle: "BLEACH", volumeNumber: 12 }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("keeps distinct editions (different publisher) separate", () => {
    const out = normalizeDetections([
      raw({ seriesTitle: "Bleach", volumeNumber: 12, publisher: "Viz" }),
      raw({ seriesTitle: "Bleach", volumeNumber: 12, publisher: "Glénat" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("never merges two unknown-volume spines of the same series", () => {
    const out = normalizeDetections([
      raw({ seriesTitle: "One Piece", volumeNumber: null }),
      raw({ seriesTitle: "One Piece", volumeNumber: null }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("assigns stable sequential ids", () => {
    const out = normalizeDetections([
      raw({ seriesTitle: "A", volumeNumber: 1 }),
      raw({ seriesTitle: "B", volumeNumber: 1 }),
    ]);
    expect(out.map((d) => d.id)).toEqual(["det-0", "det-1"]);
  });
});
