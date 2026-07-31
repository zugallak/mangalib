import { describe, expect, it } from "vitest";

import {
  isImportable,
  normalizeTitle,
  resolveDetectionStatus,
  seriesMatchKey,
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

describe("seriesMatchKey (identity)", () => {
  it("collapses spacing/case/punctuation variants to one key", () => {
    const variants = ["XXX Holic", "XXXHolic", "xxxHOLiC", "xxx holic", "XXX HOLIC"];
    const keys = variants.map(seriesMatchKey);
    expect(new Set(keys)).toEqual(new Set(["xxxholic"]));
  });

  it("keeps a sequel/subtitle distinct from its base series", () => {
    expect(seriesMatchKey("xxxHOLiC")).toBe("xxxholic");
    expect(seriesMatchKey("xxxHOLiC Rei")).toBe("xxxholicrei");
    expect(seriesMatchKey("xxxHOLiC")).not.toBe(seriesMatchKey("xxxHOLiC Rei"));
  });

  it("does not over-collapse short/distinct titles", () => {
    expect(seriesMatchKey("X")).toBe("x");
    expect(seriesMatchKey("X")).not.toBe(seriesMatchKey("XXXHolic"));
  });

  it("ignores accents for matching", () => {
    expect(seriesMatchKey("Détective Conan")).toBe(seriesMatchKey("detective conan"));
  });

  it("transliterates accented letters (Pokémon → pokemon)", () => {
    expect(seriesMatchKey("Pokémon")).toBe("pokemon");
    expect(seriesMatchKey("Pokémon")).toBe(seriesMatchKey("Pokemon"));
    expect(seriesMatchKey("Détective Conan")).toBe("detectiveconan");
  });

  // Guardrail: a naive SQL `lower(regexp_replace(title,'[^a-zA-Z0-9]+','','g'))`
  // generated column is NOT equivalent — it DELETES accented characters instead
  // of transliterating them. This is why match_key is an app-maintained column,
  // not a generated one. If this ever stops diverging, revisit that decision.
  it("differs from a naive SQL lower()+regexp_replace() on accented titles", () => {
    const sqlGeneratedStyle = (t: string) => t.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
    expect(sqlGeneratedStyle("Pokémon")).toBe("pokmon"); // accent dropped, not transliterated
    expect(seriesMatchKey("Pokémon")).not.toBe(sqlGeneratedStyle("Pokémon"));
    // ASCII titles DO agree — the divergence is only for accented characters.
    expect(seriesMatchKey("XXX Holic")).toBe(sqlGeneratedStyle("XXX Holic"));
  });
});

describe("resolveDetectionStatus (idempotent, publisher-independent)", () => {
  it("resolves an already-owned logical volume to owned regardless of publisher hint", () => {
    // Existing: xxxHOLiC volume 14 (imported earlier, publisher was Pika).
    const catalogNumbers = new Set([13, 14, 15]);
    const ownedNumbers = new Set([13, 14]);
    // New scan says publisher=CLAMP — but publisher is not even an input here.
    const status = resolveDetectionStatus({
      importable: true,
      volumeNumber: 14,
      catalogNumbers,
      ownedNumbers,
    });
    expect(status).toBe("owned");
  });

  it("resolves an unknown series/volume to new", () => {
    expect(
      resolveDetectionStatus({
        importable: true,
        volumeNumber: 99,
        catalogNumbers: undefined,
        ownedNumbers: undefined,
      }),
    ).toBe("new");
  });

  it("resolves a catalogued-but-unowned volume to new", () => {
    expect(
      resolveDetectionStatus({
        importable: true,
        volumeNumber: 15,
        catalogNumbers: new Set([15]),
        ownedNumbers: new Set([14]),
      }),
    ).toBe("new");
  });

  it("resolves a detection with no volume number to incomplete", () => {
    expect(
      resolveDetectionStatus({
        importable: false,
        volumeNumber: null,
        catalogNumbers: new Set([1]),
        ownedNumbers: new Set([1]),
      }),
    ).toBe("incomplete");
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
