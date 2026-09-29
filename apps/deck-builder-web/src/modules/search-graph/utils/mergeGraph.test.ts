import { describe, expect, it } from "vitest";
import { makeCardNode, makeEdge } from "../test-utils/makeGraph";
import { MAX_MERGED_NODES, markChainLinks, mergeGraph } from "./mergeGraph";

const base = () => ({
  rootId: "card:1",
  nodes: [makeCardNode(1, { depth: 0, isRoot: true })],
  edges: [],
});

describe("mergeGraph", () => {
  it("adds new nodes and edges from a delta", () => {
    const merged = mergeGraph(base(), {
      nodes: [makeCardNode(2)],
      edges: [makeEdge("card:1", "card:2")],
    });
    expect(merged.nodes.map((n) => n.id)).toEqual(["card:1", "card:2"]);
    expect(merged.edges).toHaveLength(1);
  });

  it("is idempotent — re-expanding the same node changes nothing", () => {
    const delta = {
      nodes: [makeCardNode(2)],
      edges: [makeEdge("card:1", "card:2")],
    };
    const once = mergeGraph(base(), delta);
    const twice = mergeGraph(once, delta);
    expect(twice.nodes).toHaveLength(2);
    expect(twice.edges).toHaveLength(1);
  });

  it("keeps an edge into a node the client already had", () => {
    // The server omits known nodes but still returns edges into them; without
    // that, a cycle closing back into a rendered node would lose its arrow.
    const current = {
      rootId: "card:1",
      nodes: [makeCardNode(1, { depth: 0, isRoot: true }), makeCardNode(2)],
      edges: [makeEdge("card:1", "card:2")],
    };
    const merged = mergeGraph(current, {
      nodes: [],
      edges: [makeEdge("card:2", "card:1")],
    });
    expect(merged.nodes).toHaveLength(2);
    expect(merged.edges).toHaveLength(2);
  });

  it("drops an edge whose endpoint is missing, to avoid a dangling arrow", () => {
    const merged = mergeGraph(base(), {
      nodes: [],
      edges: [makeEdge("card:1", "card:99")],
    });
    expect(merged.edges).toEqual([]);
  });

  it("keeps the shallower depth when a node is reachable two ways", () => {
    const current = {
      rootId: "card:1",
      nodes: [
        makeCardNode(1, { depth: 0, isRoot: true }),
        makeCardNode(2, { depth: 3 }),
      ],
      edges: [],
    };
    const merged = mergeGraph(current, {
      nodes: [makeCardNode(2, { depth: 1 })],
      edges: [],
    });
    expect(merged.nodes.find((n) => n.id === "card:2")?.depth).toBe(1);
  });

  it("never lets a delta clear the root flag", () => {
    const merged = mergeGraph(base(), {
      nodes: [makeCardNode(1, { depth: 2, isRoot: false })],
      edges: [],
    });
    expect(merged.nodes[0].isRoot).toBe(true);
  });

  it("preserves the root id", () => {
    expect(mergeGraph(base(), { nodes: [], edges: [] }).rootId).toBe("card:1");
  });

  it("caps growth at the client ceiling", () => {
    const many = Array.from({ length: MAX_MERGED_NODES + 50 }, (_, i) =>
      makeCardNode(i + 10),
    );
    const merged = mergeGraph(base(), { nodes: many, edges: [] });
    expect(merged.nodes.length).toBeLessThanOrEqual(MAX_MERGED_NODES);
  });

  it("still updates a node already present when at the cap", () => {
    const many = Array.from({ length: MAX_MERGED_NODES }, (_, i) =>
      makeCardNode(i + 10),
    );
    const full = mergeGraph(base(), { nodes: many, edges: [] });
    const merged = mergeGraph(full, {
      nodes: [makeCardNode(10, { depth: 0 })],
      edges: [],
    });
    expect(merged.nodes.find((n) => n.id === "card:10")?.depth).toBe(0);
  });
});

describe("markChainLinks", () => {
  it("marks a node with both an inbound and an outbound edge", () => {
    const graph = {
      rootId: "card:1",
      nodes: [makeCardNode(1), makeCardNode(2), makeCardNode(3)],
      edges: [makeEdge("card:1", "card:2"), makeEdge("card:2", "card:3")],
    };
    const marked = markChainLinks(graph);
    const byId = new Map(marked.nodes.map((n) => [n.id, n]));
    expect(byId.get("card:2")?.isChainLink).toBe(true);
    expect(byId.get("card:1")?.isChainLink).toBe(false);
    expect(byId.get("card:3")?.isChainLink).toBe(false);
  });

  it("marks both members of a mutual pair", () => {
    const graph = {
      rootId: "card:1",
      nodes: [makeCardNode(1), makeCardNode(2)],
      edges: [makeEdge("card:1", "card:2"), makeEdge("card:2", "card:1")],
    };
    const marked = markChainLinks(graph);
    expect(marked.nodes.every((n) => n.isChainLink)).toBe(true);
  });

  it("does not let a self-loop alone make a node a chain link", () => {
    const graph = {
      rootId: "card:1",
      nodes: [makeCardNode(1)],
      edges: [makeEdge("card:1", "card:1")],
    };
    expect(markChainLinks(graph).nodes[0].isChainLink).toBe(false);
  });

  it("recomputes after a merge, since it depends on the whole graph", () => {
    // card:2 only becomes a chain link once its outbound edge arrives.
    const first = markChainLinks({
      rootId: "card:1",
      nodes: [makeCardNode(1), makeCardNode(2)],
      edges: [makeEdge("card:1", "card:2")],
    });
    expect(first.nodes.find((n) => n.id === "card:2")?.isChainLink).toBe(false);

    const second = markChainLinks(
      mergeGraph(first, {
        nodes: [makeCardNode(3)],
        edges: [makeEdge("card:2", "card:3")],
      }),
    );
    expect(second.nodes.find((n) => n.id === "card:2")?.isChainLink).toBe(true);
  });
});
