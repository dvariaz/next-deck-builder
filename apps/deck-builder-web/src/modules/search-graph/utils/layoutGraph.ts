import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { SearchFlowNodeData } from "./toFlowElements";

/**
 * Left-to-right layered layout.
 *
 * Dagre earns its place here: with up to ~25 nodes per rank, a naive
 * depth-column layout produces unreadable edge crossings, and back-edges
 * (A searches B, B searches A) need real routing rather than a straight line
 * through the nodes between them.
 */

export const CARD_NODE_SIZE = { width: 168, height: 220 };

/**
 * Wider and shorter than a card: it holds a sentence, and sitting in its own
 * column between two ranks of tiles it has the horizontal room to spare.
 */
export const EFFECT_NODE_SIZE = { width: 240, height: 150 };

export interface LayoutOptions {
  /** Gap between ranks (tiers). */
  rankSep?: number;
  /** Gap between nodes within a rank. */
  nodeSep?: number;
}

/**
 * Returns a FRESH object every call. Dagre mutates the label it is given
 * (writing x, y, rank, order onto it), so handing it a shared constant would
 * alias every card node onto one label and collapse them all to the last
 * node's position.
 */
export function sizeForNode(node?: Node<SearchFlowNodeData>): {
  width: number;
  height: number;
} {
  return {
    ...(node?.data?.kind === "effect" ? EFFECT_NODE_SIZE : CARD_NODE_SIZE),
  };
}

/**
 * Pick ONE edge per node to hand dagre for ranking, so a node's column
 * always matches the walk out from the root rather than the longest path
 * among its parents.
 *
 * Every layered graph algorithm (dagre, ELK, graphviz dot) ranks a node at
 * the LONGEST path from any of its parents, never the shortest - each
 * inbound edge demands rank(child) > rank(parent), and the max wins. A card
 * reachable directly from the root AND via a sibling therefore gets pushed
 * one column past where it belongs, reading as "only reachable through its
 * sibling" when it is really a direct, one-hop result. `toFlowElements`
 * already computed the true (shortest-path) column as `data.rank`; feeding
 * dagre only each node's shallowest-parent edge makes its own rank algorithm
 * converge on that column for free. The full edge set is still what gets
 * rendered - this subset only steers the layout.
 */
function layoutEdges<E extends Edge>(
  nodes: Node<SearchFlowNodeData>[],
  edges: E[],
): E[] {
  const rankOf = new Map(nodes.map((n) => [n.id, n.data.rank]));
  const candidatesByTarget = new Map<string, E[]>();

  for (const edge of edges) {
    if (!rankOf.has(edge.source) || !rankOf.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    const list = candidatesByTarget.get(edge.target) ?? [];
    list.push(edge);
    candidatesByTarget.set(edge.target, list);
  }

  const spanning: E[] = [];
  for (const [targetId, candidates] of candidatesByTarget) {
    const targetRank = rankOf.get(targetId)!;
    const shallowest = candidates.find(
      (edge) => rankOf.get(edge.source) === targetRank - 1,
    );
    spanning.push(shallowest ?? candidates[0]);
  }
  return spanning;
}

export function layoutGraph<E extends Edge>(
  nodes: Node<SearchFlowNodeData>[],
  edges: E[],
  options: LayoutOptions = {},
): Node<SearchFlowNodeData>[] {
  if (!nodes.length) return nodes;

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    // Tighter than before: the sentence now lives in a node of its own, so
    // the gap between ranks no longer has to hold an edge label.
    ranksep: options.rankSep ?? 90,
    nodesep: options.nodeSep ?? 40,
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    graph.setNode(node.id, sizeForNode(node));
  }

  for (const edge of layoutEdges(nodes, edges)) {
    graph.setEdge(edge.source, edge.target, {});
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const laid = graph.node(node.id);
    if (!laid) return node;
    const { width, height } = sizeForNode(node);
    return {
      ...node,
      // Dagre positions by centre; React Flow positions by top-left.
      position: { x: laid.x - width / 2, y: laid.y - height / 2 },
    };
  });
}
