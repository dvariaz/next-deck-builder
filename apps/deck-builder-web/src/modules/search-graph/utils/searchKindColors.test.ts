import { describe, expect, it } from "vitest";
import type { SearchKind } from "@/generated/model";
import {
  ALL_SEARCH_KINDS,
  edgeStyleFor,
  orderKinds,
  primaryKind,
  styleForKind,
} from "./searchKindColors";

describe("searchKindColors", () => {
  it("has a style for every kind the API can emit", () => {
    for (const kind of ALL_SEARCH_KINDS) {
      const style = styleForKind(kind);
      expect(style.label).toBeTruthy();
      expect(style.badge).toBeTruthy();
      expect(style.stroke).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("follows the existing badge convention", () => {
    // bg-<c>-500/20 text-<c>-300 border-<c>-500/30, as CardTypeBadge does.
    expect(styleForKind("DECK_SEARCH").badge).toBe(
      "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    );
  });

  describe("primaryKind — what drives the edge colour", () => {
    it("ignores modifiers so costed searches are not all the same colour", () => {
      expect(primaryKind(["WITH_COST", "DECK_SEARCH"])).toBe("DECK_SEARCH");
      expect(primaryKind(["OPPONENT_ZONE", "REVIVAL"])).toBe("REVIVAL");
    });

    it("falls back to a modifier when that is all there is", () => {
      expect(primaryKind(["WITH_COST"])).toBe("WITH_COST");
    });

    it("picks the most specific kind for a multi-kind edge", () => {
      // Emergency Teleport is both; Extra Deck access is more specific still.
      expect(primaryKind(["HAND_EXTENDER", "DECK_SUMMON"])).toBe("DECK_SUMMON");
      expect(primaryKind(["DECK_SUMMON", "EXTRA_DECK_ACCESS"])).toBe(
        "EXTRA_DECK_ACCESS",
      );
    });

    it("is order-independent", () => {
      expect(primaryKind(["DECK_SUMMON", "HAND_EXTENDER"])).toBe(
        primaryKind(["HAND_EXTENDER", "DECK_SUMMON"]),
      );
    });

    it("returns undefined for no kinds", () => {
      expect(primaryKind([])).toBeUndefined();
    });
  });

  describe("edgeStyleFor", () => {
    it("dashes a Set edge", () => {
      expect(edgeStyleFor(["SET_FROM_DECK"]).dash).toBeTruthy();
    });

    it("does not dash a plain deck search", () => {
      expect(edgeStyleFor(["DECK_SEARCH"]).dash).toBeUndefined();
    });

    it("falls back safely for an unknown kind", () => {
      const style = edgeStyleFor(["NOT_A_KIND" as SearchKind]);
      expect(style.stroke).toBeTruthy();
    });

    it("takes the colour from the primary kind, not the first listed", () => {
      expect(edgeStyleFor(["WITH_COST", "DECK_SEARCH"]).stroke).toBe(
        styleForKind("DECK_SEARCH").stroke,
      );
    });
  });

  describe("orderKinds", () => {
    it("renders multi-kind labels in a consistent order", () => {
      expect(orderKinds(["WITH_COST", "DECK_SEARCH"])).toEqual([
        "DECK_SEARCH",
        "WITH_COST",
      ]);
      expect(orderKinds(["DECK_SEARCH", "WITH_COST"])).toEqual([
        "DECK_SEARCH",
        "WITH_COST",
      ]);
    });

    it("drops unknown kinds rather than rendering a blank badge", () => {
      expect(orderKinds(["NOPE" as SearchKind, "REVIVAL"])).toEqual([
        "REVIVAL",
      ]);
    });
  });
});
