import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { SearchFlowNodeData } from "./toFlowElements";
import {
  CARD_NODE_SIZE,
  EFFECT_NODE_SIZE,
  layoutGraph,
  sizeForNode,
} from "./layoutGraph";

const node = (id: string, rank = 0): Node<SearchFlowNodeData> =>
  ({
    id,
    type: "cardNode",
    position: { x: 0, y: 0 },
    data: {
      kind: "card",
      rank,
      node: { id, depth: rank, isRoot: rank === 0 },
      isExpanded: false,
      hasEffects: false,
    },
  }) as unknown as Node<SearchFlowNodeData>;

const effectNode = (id: string, rank = 1): Node<SearchFlowNodeData> =>
  ({
    id,
    type: "effectNode",
    position: { x: 0, y: 0 },
    data: { kind: "effect", rank, effect: { id, targets: [] }, isOpen: false },
  }) as unknown as Node<SearchFlowNodeData>;

const edge = (source: string, target: string): Edge =>
  ({ id: `${source}->${target}`, source, target }) as Edge;

describe("layoutGraph", () => {
  it("returns an empty array unchanged", () => {
    expect(layoutGraph([], [])).toEqual([]);
  });

  it("assigns a position to every node", () => {
    const laid = layoutGraph([node("a", 0), node("b", 1)], [edge("a", "b")]);
    expect(laid).toHaveLength(2);
    for (const n of laid) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it("lays tiers out left to right", () => {
    const laid = layoutGraph(
      [node("a", 0), node("b", 1), node("c", 2)],
      [edge("a", "b"), edge("b", "c")],
    );
    const byId = new Map(laid.map((n) => [n.id, n.position.x]));
    expect(byId.get("a")!).toBeLessThan(byId.get("b")!);
    expect(byId.get("b")!).toBeLessThan(byId.get("c")!);
  });

  it("separates siblings within a rank", () => {
    const laid = layoutGraph(
      [node("a", 0), node("b", 1), node("c", 1)],
      [edge("a", "b"), edge("a", "c")],
    );
    const b = laid.find((n) => n.id === "b")!;
    const c = laid.find((n) => n.id === "c")!;
    expect(b.position.y).not.toBe(c.position.y);
  });

  it("survives a cycle rather than hanging", () => {
    const laid = layoutGraph(
      [node("a", 0), node("b", 1)],
      [edge("a", "b"), edge("b", "a")],
    );
    expect(laid).toHaveLength(2);
  });

  it("ignores a self-loop, which has no rank to assign", () => {
    const laid = layoutGraph([node("a")], [edge("a", "a")]);
    expect(laid).toHaveLength(1);
    expect(Number.isFinite(laid[0].position.x)).toBe(true);
  });

  it("ignores an edge to a node it does not know about", () => {
    // Dagre throws on an unknown node; the filter keeps a stale edge harmless.
    expect(() => layoutGraph([node("a")], [edge("a", "ghost")])).not.toThrow();
  });

  it("is deterministic for the same input", () => {
    const nodes = [node("a", 0), node("b", 1), node("c", 1)];
    const edges = [edge("a", "b"), edge("a", "c")];
    expect(layoutGraph(nodes, edges).map((n) => n.position)).toEqual(
      layoutGraph(nodes, edges).map((n) => n.position),
    );
  });

  it("converts dagre centre coordinates to React Flow top-left", () => {
    const laid = layoutGraph([node("a")], []);
    // With a single node dagre centres it at (marginx + w/2, marginy + h/2),
    // so the top-left must land on the margin itself.
    expect(laid[0].position.x).toBeCloseTo(24, 0);
    expect(laid[0].position.y).toBeCloseTo(24, 0);
  });

  describe("ranks by the walk out from the root, not the longest path", () => {
    // The bug this guards: "Fabled Lurrie" is a direct, tier-1 result of
    // Fiendsmith's Tract, but ALSO reachable via a tier-1 sibling that
    // happens to search it too. A naive layered layout (dagre, ELK, dot -
    // all of them) ranks a node at the longest path among its parents, which
    // would push it to tier 2, reading as "only reachable through the
    // sibling" when it is really a direct one-hop result.
    it("keeps a node at its shallowest rank even with a deeper second parent", () => {
      const laid = layoutGraph(
        [node("root", 0), node("sibling", 1), node("target", 1)],
        [
          edge("root", "sibling"),
          edge("root", "target"),
          edge("sibling", "target"),
        ],
      );
      const byId = new Map(laid.map((n) => [n.id, n.position.x]));
      expect(byId.get("target")).toBe(byId.get("sibling"));
      expect(byId.get("root")!).toBeLessThan(byId.get("target")!);
    });

    it("falls back to the first available parent when no shallower one exists", () => {
      // e.g. after a client-side filter removes the edge that produced the
      // node's depth. Layout still succeeds rather than crashing.
      const laid = layoutGraph(
        [node("a", 0), node("b", 1), node("c", 5)],
        [edge("a", "b"), edge("b", "c")],
      );
      expect(laid).toHaveLength(3);
    });
  });

  it("sizes a card tile and an effect box differently", () => {
    expect(sizeForNode(node("a"))).toEqual(CARD_NODE_SIZE);
    expect(sizeForNode(effectNode("e"))).toEqual(EFFECT_NODE_SIZE);
  });

  it("falls back to the card size for an unknown node", () => {
    expect(sizeForNode()).toEqual(CARD_NODE_SIZE);
  });

  it("returns a fresh size object each call", () => {
    // Dagre writes x/y/rank onto the label it is given. A shared constant
    // would alias every node onto one label and collapse the whole layout.
    const first = sizeForNode(node("a"));
    const second = sizeForNode(node("a"));
    expect(first).not.toBe(second);
  });

  it("positions an effect box by its own height, not the card's", () => {
    const laid = layoutGraph([effectNode("e", 0)], []);
    expect(laid[0].position.y).toBeCloseTo(24, 0);
  });

  it("lays a card, its effect and the target out in three columns", () => {
    const laid = layoutGraph(
      [node("a", 0), effectNode("e", 1), node("b", 2)],
      [edge("a", "e"), edge("e", "b")],
    );
    const byId = new Map(laid.map((n) => [n.id, n.position.x]));
    expect(byId.get("a")!).toBeLessThan(byId.get("e")!);
    expect(byId.get("e")!).toBeLessThan(byId.get("b")!);
  });
});
