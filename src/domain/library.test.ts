import { describe, expect, it } from "vitest";

import {
  buildSeriesDetail,
  dedupeVolumeIds,
  partitionByOwnership,
  summarizeSeries,
} from "@/domain/library";
import type { Series } from "@/domain/types";

const SERIES: Series = { id: "s1", title: "X", originalTitle: null };

describe("dedupeVolumeIds", () => {
  it("removes duplicates preserving first-seen order", () => {
    expect(dedupeVolumeIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });
});

describe("partitionByOwnership", () => {
  it("splits candidates into alreadyOwned vs toAdd, deduped", () => {
    const owned = new Set(["v12", "v13"]);
    const { alreadyOwned, toAdd } = partitionByOwnership(["v12", "v13", "v14", "v14"], owned);
    expect(alreadyOwned).toEqual(["v12", "v13"]);
    expect(toAdd).toEqual(["v14"]);
  });

  it("adds everything when nothing is owned", () => {
    const { alreadyOwned, toAdd } = partitionByOwnership(["a", "b"], new Set());
    expect(alreadyOwned).toEqual([]);
    expect(toAdd).toEqual(["a", "b"]);
  });
});

describe("summarizeSeries (truthful completeness)", () => {
  it("never claims completeness when the total is unknown", () => {
    const s = summarizeSeries({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      catalogVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      totalVolumes: null,
    });
    expect(s.ownedCount).toBe(12);
    expect(s.totalVolumes).toBeNull();
    expect(s.missingCount).toBeNull();
    expect(s.isComplete).toBe(false);
  });

  it("is Complete only when a known total is fully covered", () => {
    const owned = Array.from({ length: 18 }, (_, i) => i + 1);
    const s = summarizeSeries({
      series: SERIES,
      ownedVolumeNumbers: owned,
      catalogVolumeNumbers: owned,
      totalVolumes: 18,
    });
    expect(s.isComplete).toBe(true);
    expect(s.missingCount).toBe(0);
  });

  it("is not Complete when a known total is only partially owned", () => {
    const s = summarizeSeries({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      catalogVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      totalVolumes: 18,
    });
    expect(s.isComplete).toBe(false);
    expect(s.missingCount).toBe(6);
  });

  it("counts DISTINCT owned numbers (duplicate catalog rows can't inflate)", () => {
    const s = summarizeSeries({
      series: SERIES,
      ownedVolumeNumbers: [1, 1, 2, 2, 3], // duplicate rows for same numbers
      catalogVolumeNumbers: [1, 2, 3],
      totalVolumes: null,
    });
    expect(s.ownedCount).toBe(3);
  });
});

describe("buildSeriesDetail (logical grid with gaps)", () => {
  const num = (v: { volumeNumber: number }) => v.volumeNumber;

  it("UNKNOWN total: fills gaps up to knownMax without claiming completeness", () => {
    // The real Chobits case: owned 1,2,6,8, total unknown.
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 6, 8],
      catalogVolumeNumbers: [1, 2, 6, 8],
      totalVolumes: null,
    });
    expect(detail.volumes.map(num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(detail.volumes.filter((v) => v.owned).map(num)).toEqual([1, 2, 6, 8]);
    expect(detail.volumes.filter((v) => !v.owned).map(num)).toEqual([3, 4, 5, 7]);
    expect(detail.knownMaxVolume).toBe(8);
    expect(detail.missingInRange).toBe(4);
    expect(detail.totalVolumes).toBeNull();
    expect(detail.isComplete).toBe(false);
    // Gap tiles are display-only placeholders, not catalog volumes.
    for (const v of detail.volumes.filter((x) => !x.owned)) {
      expect(v.knownCatalogVolume).toBe(false);
    }
  });

  it("KNOWN total: same 1..total grid, gaps are authoritatively missing", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 6, 8],
      catalogVolumeNumbers: [1, 2, 6, 8],
      totalVolumes: 8,
    });
    expect(detail.volumes.map(num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(detail.volumes.filter((v) => !v.owned).map(num)).toEqual([3, 4, 5, 7]);
    expect(detail.ownedCount).toBe(4);
    expect(detail.totalVolumes).toBe(8);
    expect(detail.missingInRange).toBe(4);
    expect(detail.isComplete).toBe(false);
  });

  it("KNOWN complete: fully owned known range is Complete with no missing", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 3, 4],
      catalogVolumeNumbers: [1, 2, 3, 4],
      totalVolumes: 4,
    });
    expect(detail.isComplete).toBe(true);
    expect(detail.missingInRange).toBe(0);
  });

  it("UNKNOWN contiguous: zero gaps but NEVER Complete", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 3, 4],
      catalogVolumeNumbers: [1, 2, 3, 4],
      totalVolumes: null,
    });
    expect(detail.volumes.map(num)).toEqual([1, 2, 3, 4]);
    expect(detail.missingInRange).toBe(0);
    expect(detail.isComplete).toBe(false);
  });

  it("handles a single-volume known total (total_volumes >= 1)", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1],
      catalogVolumeNumbers: [1],
      totalVolumes: 1,
    });
    expect(detail.volumes).toEqual([
      { volumeNumber: 1, owned: true, knownCatalogVolume: true, status: "owned" },
    ]);
    expect(detail.isComplete).toBe(true);
  });

  it("INCONSISTENT total: owned beyond total is still shown, never Complete", () => {
    // totalVolumes=8 but the user owns volume 9 (stale metadata).
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      catalogVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      totalVolumes: 8,
    });
    expect(detail.volumes.map(num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(detail.totalVolumes).toBe(8); // unchanged, not promoted to 9
    expect(detail.knownMaxVolume).toBe(9);
    expect(detail.isComplete).toBe(false);
  });

  it("INCONSISTENT total: catalog knows volume 9 (unowned) beyond total=8", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
      catalogVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      totalVolumes: 8,
    });
    expect(detail.volumes.map(num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const vol9 = detail.volumes.find((v) => v.volumeNumber === 9);
    expect(vol9?.owned).toBe(false);
    expect(detail.isComplete).toBe(false);
  });

  it("CONSISTENT total: owned exactly 1..8 is unchanged and Complete", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
      catalogVolumeNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
      totalVolumes: 8,
    });
    expect(detail.volumes.map(num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(detail.missingInRange).toBe(0);
    expect(detail.isComplete).toBe(true);
  });

  it("defensively degrades to known numbers when data implies an absurd range", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 99999], // bad imported number
      catalogVolumeNumbers: [1, 99999],
      totalVolumes: null,
    });
    // Does NOT render ~100k placeholder tiles.
    expect(detail.volumes.map(num)).toEqual([1, 99999]);
    expect(detail.volumes.length).toBe(2);
    expect(detail.knownMaxVolume).toBe(99999);
  });
});
