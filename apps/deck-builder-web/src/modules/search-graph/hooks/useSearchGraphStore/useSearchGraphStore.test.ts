import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_DEPTH,
  MIN_DEPTH,
  useSearchGraphStore,
} from "./useSearchGraphStore";

const store = () => useSearchGraphStore.getState();

describe("useSearchGraphStore", () => {
  beforeEach(() => {
    useSearchGraphStore.setState({
      depth: 2,
      archetypeOnly: false,
      hiddenKinds: [],
    });
  });

  describe("depth", () => {
    it("defaults to 2 tiers", () => {
      expect(store().depth).toBe(2);
    });

    it("sets a depth in range", () => {
      store().setDepth(3);
      expect(store().depth).toBe(3);
    });

    it("clamps below the minimum", () => {
      store().setDepth(0);
      expect(store().depth).toBe(MIN_DEPTH);
    });

    it("clamps above the maximum, which the API also enforces", () => {
      store().setDepth(99);
      expect(store().depth).toBe(MAX_DEPTH);
    });
  });

  describe("archetypeOnly", () => {
    it("toggles", () => {
      store().toggleArchetypeOnly();
      expect(store().archetypeOnly).toBe(true);
      store().toggleArchetypeOnly();
      expect(store().archetypeOnly).toBe(false);
    });
  });

  describe("hiddenKinds", () => {
    it("starts with everything visible", () => {
      expect(store().hiddenKinds).toEqual([]);
    });

    it("hides and re-shows a kind", () => {
      store().toggleKind("DECK_SEARCH");
      expect(store().hiddenKinds).toEqual(["DECK_SEARCH"]);
      store().toggleKind("DECK_SEARCH");
      expect(store().hiddenKinds).toEqual([]);
    });

    it("tracks several kinds independently", () => {
      store().toggleKind("DECK_SEARCH");
      store().toggleKind("REVIVAL");
      expect(store().hiddenKinds.sort()).toEqual(["DECK_SEARCH", "REVIVAL"]);
    });

    it("does not duplicate a kind", () => {
      store().toggleKind("DECK_SEARCH");
      store().toggleKind("REVIVAL");
      store().toggleKind("REVIVAL");
      expect(store().hiddenKinds).toEqual(["DECK_SEARCH"]);
    });

    it("restores everything at once", () => {
      store().toggleKind("DECK_SEARCH");
      store().toggleKind("REVIVAL");
      store().showAllKinds();
      expect(store().hiddenKinds).toEqual([]);
    });
  });

  it("exposes per-key selectors via createSelectors", () => {
    expect(typeof useSearchGraphStore.use.depth).toBe("function");
    expect(typeof useSearchGraphStore.use.toggleKind).toBe("function");
  });
});
