import { describe, expect, it } from "vitest";
import { makeCard } from "../test-utils/makeCard";
import { sortCards } from "./sortCards";

describe("sortCards", () => {
  it("does not mutate the input array", () => {
    const cards = [makeCard({ name: "B" }), makeCard({ name: "A" })];
    const original = [...cards];

    sortCards(cards, "name", "asc");

    expect(cards).toEqual(original);
  });

  it("sorts by name ascending and descending", () => {
    const cards = [
      makeCard({ name: "Beta" }),
      makeCard({ name: "Alpha" }),
      makeCard({ name: "Charlie" }),
    ];

    expect(sortCards(cards, "name", "asc").map((c) => c.name)).toEqual([
      "Alpha",
      "Beta",
      "Charlie",
    ]);
    expect(sortCards(cards, "name", "desc").map((c) => c.name)).toEqual([
      "Charlie",
      "Beta",
      "Alpha",
    ]);
  });

  it("sorts by atk and treats missing atk as -1", () => {
    const cards = [
      makeCard({ name: "high", atk: 3000 }),
      makeCard({ name: "none" }),
      makeCard({ name: "zero", atk: 0 }),
    ];

    expect(sortCards(cards, "atk", "asc").map((c) => c.name)).toEqual([
      "none",
      "zero",
      "high",
    ]);
    expect(sortCards(cards, "atk", "desc").map((c) => c.name)).toEqual([
      "high",
      "zero",
      "none",
    ]);
  });

  it("sorts by def and treats missing def as -1", () => {
    const cards = [
      makeCard({ name: "mid", def: 1500 }),
      makeCard({ name: "none" }),
      makeCard({ name: "zero", def: 0 }),
    ];

    expect(sortCards(cards, "def", "asc").map((c) => c.name)).toEqual([
      "none",
      "zero",
      "mid",
    ]);
  });

  it("sorts by level, falling back to linkVal then 0", () => {
    const cards = [
      makeCard({ name: "level4", level: 4 }),
      makeCard({ name: "link2", linkVal: 2 }),
      makeCard({ name: "none" }),
    ];

    expect(sortCards(cards, "level", "asc").map((c) => c.name)).toEqual([
      "none",
      "link2",
      "level4",
    ]);
  });

  it("prefers level over linkVal when both are present", () => {
    const cards = [
      makeCard({ name: "a", level: 1, linkVal: 8 }),
      makeCard({ name: "b", level: 5, linkVal: 1 }),
    ];

    expect(sortCards(cards, "level", "asc").map((c) => c.name)).toEqual([
      "a",
      "b",
    ]);
  });

  it("leaves the order unchanged for an unknown field", () => {
    const cards = [makeCard({ name: "b" }), makeCard({ name: "a" })];

    expect(sortCards(cards, "unknown", "asc").map((c) => c.name)).toEqual([
      "b",
      "a",
    ]);
    expect(sortCards(cards, "unknown", "desc").map((c) => c.name)).toEqual([
      "b",
      "a",
    ]);
  });

  it("returns an empty array unchanged", () => {
    expect(sortCards([], "name", "asc")).toEqual([]);
  });
});
