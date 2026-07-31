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

describe("buildSeriesDetail (logical grid)", () => {
  it("shows only known/owned numbers when the total is unknown", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 5],
      catalogVolumeNumbers: [1, 2, 5],
      totalVolumes: null,
    });
    expect(detail.volumes.map((v) => v.volumeNumber)).toEqual([1, 2, 5]);
    expect(detail.volumes.every((v) => v.owned)).toBe(true);
    expect(detail.isComplete).toBe(false);
  });

  it("shows the full 1..total grid with missing slots when the total is known", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1, 2, 3],
      catalogVolumeNumbers: [1, 2, 3],
      totalVolumes: 5,
    });
    expect(detail.volumes.map((v) => v.volumeNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(detail.volumes.filter((v) => !v.owned).map((v) => v.volumeNumber)).toEqual([4, 5]);
  });

  it("handles a single-volume known total (total_volumes >= 1)", () => {
    const detail = buildSeriesDetail({
      series: SERIES,
      ownedVolumeNumbers: [1],
      catalogVolumeNumbers: [1],
      totalVolumes: 1,
    });
    expect(detail.volumes).toEqual([{ volumeNumber: 1, owned: true, status: "owned" }]);
    expect(detail.isComplete).toBe(true);
  });
});
