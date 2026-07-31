import { describe, expect, it } from "vitest";

import {
  isImportable,
  normalizeTitle,
  summarizeResolutions,
  type DetectionResolution,
} from "@/domain/catalog";

describe("normalizeTitle", () => {
  it("lowercases, strips accents and collapses punctuation/space", () => {
    expect(normalizeTitle("  BLEACH ")).toBe("bleach");
    expect(normalizeTitle("Fullmetal Alchemist")).toBe("fullmetal alchemist");
    expect(normalizeTitle("Pokémon")).toBe("pokemon");
    expect(normalizeTitle("Bleach!!")).toBe("bleach");
  });

  it("matches case/accent variants to the same key", () => {
    expect(normalizeTitle("Détective Conan")).toBe(normalizeTitle("detective conan"));
  });
});

describe("isImportable", () => {
  it("requires a non-empty title and a volume number", () => {
    expect(isImportable({ seriesTitle: "Bleach", volumeNumber: 12 })).toBe(true);
    expect(isImportable({ seriesTitle: "Bleach", volumeNumber: null })).toBe(false);
    expect(isImportable({ seriesTitle: "  ", volumeNumber: 1 })).toBe(false);
  });
});

describe("summarizeResolutions", () => {
  it("counts owned / toAdd / needsReview correctly", () => {
    const resolutions: DetectionResolution[] = [
      { detectionId: "1", status: "owned" },
      { detectionId: "2", status: "new" },
      { detectionId: "3", status: "new" },
      { detectionId: "4", status: "ambiguous" },
      { detectionId: "5", status: "incomplete" },
    ];
    expect(summarizeResolutions(resolutions)).toEqual({
      total: 5,
      owned: 1,
      toAdd: 2,
      needsReview: 2,
    });
  });
});
