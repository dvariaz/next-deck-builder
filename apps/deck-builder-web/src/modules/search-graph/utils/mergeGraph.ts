import type { SearchGraphEdgeDto, SearchGraphNodeDto } from "@/generated/model";

/** The accumulated graph the canvas renders. */
export interface MergedGraph {
  rootId: string;
  nodes: SearchGraphNodeDto[];
  edges: SearchGraphEdgeDto[];
}

/** Client-side ceiling, independent of the server's per-request nodeLimit. */
export const MAX_MERGED_NODES = 200;

/**
 * Merge an expansion delta into the graph.
 *
 * The server omits nodes the client already holds but still returns edges into
 * them, so the graph can grow without a refetch AND still close cycles back
 * into rendered nodes. Both collections are keyed by id, so merging is
 * idempotent - re-expanding the same node changes nothing.
 */
export function mergeGraph(
  current: MergedGraph,
  delta: { nodes: SearchGraphNodeDto[]; edges: SearchGraphEdgeDto[] },
): MergedGraph {
  const nodes = new Map(current.nodes.map((node) => [node.id, node]));

  for (const node of delta.nodes) {
    if (nodes.size >= MAX_MERGED_NODES && !nodes.has(node.id)) continue;
    // Keep the shallower depth: a node first seen at tier 3 may be reachable
    // in one step from somewhere else, and the shallower reading is the useful
    // one. Never overwrite the root flag.
    const existing = nodes.get(node.id);
    nodes.set(
      node.id,
      existing
        ? {
            ...node,
            depth: Math.min(existing.depth, node.depth),
            isRoot: existing.isRoot || node.isRoot,
          }
        : node,
    );
  }

  const edges = new Map(current.edges.map((edge) => [edge.id, edge]));
  for (const edge of delta.edges) {
    // Only keep edges whose endpoints are both present, or React Flow warns.
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
    edges.set(edge.id, edge);
  }

  return {
    rootId: current.rootId,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}

/** Recompute isChainLink after a merge, since it depends on the whole graph. */
export function markChainLinks(graph: MergedGraph): MergedGraph {
  const inbound = new Set<string>();
  const outbound = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue;
    outbound.add(edge.from);
    inbound.add(edge.to);
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      isChainLink: inbound.has(node.id) && outbound.has(node.id),
    })),
  };
}
