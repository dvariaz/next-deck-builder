import { describe, expect, it } from "vitest";
import type { Node, XYPosition } from "@xyflow/react";
import { anchorLayout } from "./anchorLayout";
import type { SearchFlowNodeData } from "./toFlowElements";

const card = (
  id: string,
  position: XYPosition,
  isRoot = false,
): Node<SearchFlowNodeData> =>
  ({
    id,
    type: "cardNode",
    position,
    data: { kind: "card", rank: 0, node: { id, isRoot }, isExpanded: false },
  }) as unknown as Node<SearchFlowNodeData>;

const effect = (id: string, position: XYPosition): Node<SearchFlowNodeData> =>
  ({
    id,
    type: "effectNode",
    position,
    data: { kind: "effect", rank: 1, effect: { id }, isOpen: true },
  }) as unknown as Node<SearchFlowNodeData>;

const previous = (entries: [string, XYPosition][]): Map<string, XYPosition> =>
  new Map(entries);

const posOf = (nodes: Node<SearchFlowNodeData>[]) =>
  new Map(nodes.map((n) => [n.id, n.position]));

describe("anchorLayout", () => {
  it("holds the clicked node exactly where it was", () => {
    // The bug: opening an effect grows the graph, dagre pushes everything
    // down, and the viewport does not follow.
    const laid = anchorLayout(
      [card("root", { x: 24, y: 900 }, true), effect("e", { x: 300, y: 900 })],
      previous([["e", { x: 300, y: 100 }]]),
      "e",
    );
    expect(posOf(laid).get("e")).toEqual({ x: 300, y: 100 });
  });

  it("moves every other node by the same delta", () => {
    const laid = anchorLayout(
      [card("root", { x: 24, y: 900 }, true), effect("e", { x: 300, y: 900 })],
      previous([["e", { x: 300, y: 100 }]]),
      "e",
    );
    expect(posOf(laid).get("root")).toEqual({ x: 24, y: 100 });
  });

  it("keeps newly revealed nodes in the same frame as the anchor", () => {
    const laid = anchorLayout(
      [effect("e", { x: 300, y: 900 }), card("new", { x: 600, y: 1100 })],
      previous([["e", { x: 300, y: 100 }]]),
      "e",
    );
    // 200px below the anchor before the shift, still 200px below after it.
    expect(posOf(laid).get("new")).toEqual({ x: 600, y: 300 });
  });

  it("falls back to the root when the anchor is not in the new layout", () => {
    const laid = anchorLayout(
      [card("root", { x: 24, y: 900 }, true)],
      previous([["root", { x: 24, y: 24 }]]),
      "effect:gone",
    );
    expect(posOf(laid).get("root")).toEqual({ x: 24, y: 24 });
  });

  it("falls back to the root when nothing was clicked yet", () => {
    const laid = anchorLayout(
      [card("root", { x: 24, y: 500 }, true), effect("e", { x: 300, y: 500 })],
      previous([["root", { x: 24, y: 24 }]]),
      null,
    );
    expect(posOf(laid).get("root")).toEqual({ x: 24, y: 24 });
  });

  it("falls back to any carried-over node when the root is gone", () => {
    // e.g. an archetype filter that drops the root from the rendered set.
    const laid = anchorLayout(
      [effect("e", { x: 300, y: 500 })],
      previous([["e", { x: 300, y: 42 }]]),
      null,
    );
    expect(posOf(laid).get("e")).toEqual({ x: 300, y: 42 });
  });

  it("leaves a first layout alone, since nothing carries over", () => {
    // A new root card: dagre's own framing is correct, and fitView reframes.
    const nodes = [card("root", { x: 24, y: 24 }, true)];
    expect(anchorLayout(nodes, new Map(), null)).toBe(nodes);
  });

  it("returns the same array when the anchor has not moved", () => {
    // No new objects, so React Flow does not churn every node.
    const nodes = [card("root", { x: 24, y: 24 }, true)];
    expect(
      anchorLayout(nodes, previous([["root", { x: 24, y: 24 }]]), null),
    ).toBe(nodes);
  });

  it("handles an empty layout", () => {
    expect(
      anchorLayout([], previous([["root", { x: 0, y: 0 }]]), null),
    ).toEqual([]);
  });

  it("is stable when applied twice, as a StrictMode double-render would", () => {
    const fresh = [
      card("root", { x: 24, y: 900 }, true),
      effect("e", { x: 300, y: 900 }),
    ];
    const once = anchorLayout(
      fresh,
      previous([["e", { x: 300, y: 100 }]]),
      "e",
    );
    const twice = anchorLayout(fresh, posOf(once), "e");
    expect(posOf(twice)).toEqual(posOf(once));
  });
});
