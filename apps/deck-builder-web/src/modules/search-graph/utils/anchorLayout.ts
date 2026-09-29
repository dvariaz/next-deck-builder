import type { Node, XYPosition } from "@xyflow/react";
import type { SearchFlowNodeData } from "./toFlowElements";

/**
 * Hold one node still across a re-layout.
 *
 * Dagre lays the graph out from its own origin every time, so opening an
 * effect that adds eight cards grows the graph's height and pushes every
 * existing node - the root included - hundreds of pixels down. The viewport
 * does not follow (`fitView` only runs at init), so the canvas appears to
 * jump off screen and the user has to go hunting for it.
 *
 * Translating the fresh layout so that one node keeps its previous screen
 * position fixes that without fighting dagre: the node the user just clicked
 * stays under the cursor, and everything else moves relative to it.
 */
export function anchorLayout(
  nodes: Node<SearchFlowNodeData>[],
  previous: Map<string, XYPosition>,
  anchorId?: string | null,
): Node<SearchFlowNodeData>[] {
  const anchor = pickAnchor(nodes, previous, anchorId);
  if (!anchor) return nodes;

  const was = previous.get(anchor.id)!;
  const dx = was.x - anchor.position.x;
  const dy = was.y - anchor.position.y;
  if (dx === 0 && dy === 0) return nodes;

  return nodes.map((node) => ({
    ...node,
    position: { x: node.position.x + dx, y: node.position.y + dy },
  }));
}

/**
 * The node the user just acted on, else the root, else anything we can hold
 * on to. A first layout has nothing in common with the previous one - a new
 * root card, say - and gets no translation at all.
 */
function pickAnchor(
  nodes: Node<SearchFlowNodeData>[],
  previous: Map<string, XYPosition>,
  anchorId: string | null | undefined,
): Node<SearchFlowNodeData> | undefined {
  const known = (node: Node<SearchFlowNodeData>) => previous.has(node.id);

  return (
    (anchorId ? nodes.find((n) => n.id === anchorId && known(n)) : undefined) ??
    nodes.find(
      (node) =>
        node.data.kind === "card" && node.data.node.isRoot && known(node),
    ) ??
    nodes.find(known)
  );
}
