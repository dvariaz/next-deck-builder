import { describe, expect, it } from "vitest";
import { makeEdge } from "../test-utils/makeGraph";
import { groupEdgesByEffect, groupsByCard } from "./effectGroups";

describe("groupEdgesByEffect", () => {
  it("keys by the card AND the sentence, so two cards never share a node", () => {
    const groups = groupEdgesByEffect([
      makeEdge("card:1", "card:3"),
      makeEdge("card:2", "card:3"),
    ]);
    expect(groups.size).toBe(2);
    expect([...groups.values()].map((g) => g.from)).toEqual([
      "card:1",
      "card:2",
    ]);
  });

  it("is stable: the same sentence gets the same id whatever the edge order", () => {
    // The id is the open/closed key, so a reordering after an expansion must
    // not silently collapse a group the user had opened.
    const a = groupEdgesByEffect([
      makeEdge("card:1", "card:2"),
      makeEdge("card:1", "card:3"),
    ]);
    const b = groupEdgesByEffect([
      makeEdge("card:1", "card:3"),
      makeEdge("card:1", "card:2"),
    ]);
    expect([...a.keys()]).toEqual([...b.keys()]);
  });

  it("de-duplicates a target reached twice by the same sentence", () => {
    const groups = groupEdgesByEffect([
      makeEdge("card:1", "card:2", { id: "a" }),
      makeEdge("card:1", "card:2", { id: "b" }),
    ]);
    const group = [...groups.values()][0];
    expect(group.targets).toEqual(["card:2"]);
    expect(group.edges).toHaveLength(2);
  });

  it("collects costs without repeating them", () => {
    const groups = groupEdgesByEffect([
      makeEdge("card:1", "card:2", { costs: ["Discard 1"] }),
      makeEdge("card:1", "card:3", { costs: ["Discard 1"] }),
    ]);
    expect([...groups.values()][0].costs).toEqual(["Discard 1"]);
  });

  it("orders the unioned kinds for display rather than by arrival", () => {
    const groups = groupEdgesByEffect([
      makeEdge("card:1", "card:2", { kinds: ["WITH_COST"] }),
      makeEdge("card:1", "card:3", { kinds: ["DECK_SEARCH"] }),
    ]);
    expect([...groups.values()][0].kinds).toEqual(["DECK_SEARCH", "WITH_COST"]);
  });

  it("flags Hard Once Per Turn if any edge in the group carries it", () => {
    const groups = groupEdgesByEffect([
      makeEdge("card:1", "card:2"),
      makeEdge("card:1", "card:3", {
        restrictions: ["Hard once per turn (this effect)"],
      }),
    ]);
    expect([...groups.values()][0].hardOncePerTurn).toBe(true);
  });

  it("returns nothing for no edges", () => {
    expect(groupEdgesByEffect([]).size).toBe(0);
  });
});

describe("groupsByCard", () => {
  it("buckets every sentence under the card it came from", () => {
    const groups = groupEdgesByEffect([
      makeEdge("card:1", "card:2"),
      makeEdge("card:1", "card:3", { sourceText: "Special Summon it." }),
      makeEdge("card:2", "card:3"),
    ]);
    const byCard = groupsByCard(groups.values());
    expect(byCard.get("card:1")).toHaveLength(2);
    expect(byCard.get("card:2")).toHaveLength(1);
    expect(byCard.has("card:3")).toBe(false);
  });
});
