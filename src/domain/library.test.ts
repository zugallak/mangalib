import { describe, expect, it } from "vitest";

import { dedupeVolumeIds, partitionByOwnership } from "@/domain/library";

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
