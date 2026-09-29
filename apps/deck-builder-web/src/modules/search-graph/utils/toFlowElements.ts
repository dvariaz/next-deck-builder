import type { Edge, Node } from "@xyflow/react";
import type {
  SearchGraphEdgeDto,
  SearchGraphNodeDto,
  SearchKind,
} from "@/generated/model";
import {
  groupEdgesByEffect,
  groupsByCard,
  type EffectGroup,
} from "./effectGroups";
import { edgeStyleFor } from "./searchKindColors";

/**
 * Translate the API graph into React Flow elements.
 *
 * Pure and unit-tested: React Flow itself cannot lay out in jsdom, so all the
 * logic that can be verified lives here rather than in the canvas component.
 *
 * The shape is card -> effect -> card. An effect node carries the sentence and
 * stays CLOSED until asked, so a card opens as "here is what it does" instead
 * of dumping every result tier onto the canvas at once.
 */

export type CardFlowNodeData = {
  kind: "card";
  /** Layout column. Cards sit on even ranks, effects on odd ones. */
  rank: number;
  node: SearchGraphNodeDto;
  /** Already grown one tier deeper from the server. */
  isExpanded: boolean;
  /** Has at least one effect node of its own on the canvas. */
  hasEffects: boolean;
  /** Somewhere is listening for a peek, so the node offers the button. */
  canPeek: boolean;
  /** This card is the pinned preview, so the button reads as "unpin". */
  isPeekLocked: boolean;
};

export type EffectFlowNodeData = {
  kind: "effect";
  rank: number;
  effect: EffectGroup;
  /** Its target cards are on the canvas. */
  isOpen: boolean;
};

export type SearchFlowNodeData = CardFlowNodeData | EffectFlowNodeData;

export type SearchFlowEdgeData = {
  edge?: SearchGraphEdgeDto;
  effect: EffectGroup;
};

export interface ToFlowOptions {
  /** Node ids already expanded, so the node hides its "+" handle. */
  expandedIds?: Set<string>;
  /** Effect node ids whose target cards should be shown. */
  openEffectIds?: Set<string>;
  /** Kinds to hide. Edges are dropped, then orphaned nodes with them. */
  hiddenKinds?: Set<SearchKind>;
  /** Hide nodes not sharing this archetype. The root is always kept. */
  archetypeOnly?: string | null;
  /** Render the per-card peek button. */
  canPeek?: boolean;
  /** Card id currently pinned into the preview pane, if any. */
  lockedCardId?: number | null;
}

const isVisibleEdge = (
  edge: SearchGraphEdgeDto,
  hidden: Set<SearchKind> | undefined,
) =>
  !hidden?.size || !edge.kinds.every((kind) => hidden.has(kind as SearchKind));

/**
 * Which nodes survive the archetype filter.
 *
 * Applied client-side rather than by refetching, so the toggle is instant and
 * reversible.
 */
function visibleNodeIds(
  nodes: SearchGraphNodeDto[],
  archetypeOnly: string | null | undefined,
): Set<string> {
  if (!archetypeOnly) return new Set(nodes.map((node) => node.id));

  return new Set(
    nodes
      .filter((node) => node.isRoot || node.card.archetype === archetypeOnly)
      .map((node) => node.id),
  );
}

interface Reached {
  cardRanks: Map<string, number>;
  effectRanks: Map<string, number>;
}

/**
 * Walk out from the root, stopping at every closed effect.
 *
 * Breadth-first, so a card reached by two routes keeps the shallower column -
 * the same guarantee the server's `depth` used to give, now that the columns
 * are derived from what the user has opened rather than from the fetch tier.
 */
function reachable(
  rootId: string | undefined,
  byCard: Map<string, EffectGroup[]>,
  open: Set<string> | undefined,
): Reached {
  const cardRanks = new Map<string, number>();
  const effectRanks = new Map<string, number>();
  if (!rootId) return { cardRanks, effectRanks };

  const queue: string[] = [rootId];
  cardRanks.set(rootId, 0);

  for (let head = 0; head < queue.length; head++) {
    const cardId = queue[head];
    const rank = cardRanks.get(cardId)!;

    for (const group of byCard.get(cardId) ?? []) {
      if (effectRanks.has(group.id)) continue;
      effectRanks.set(group.id, rank + 1);
      if (!open?.has(group.id)) continue;

      for (const target of group.targets) {
        if (cardRanks.has(target)) continue;
        cardRanks.set(target, rank + 2);
        queue.push(target);
      }
    }
  }

  return { cardRanks, effectRanks };
}

export function toFlowElements(
  nodes: SearchGraphNodeDto[],
  edges: SearchGraphEdgeDto[],
  options: ToFlowOptions = {},
): { nodes: Node<SearchFlowNodeData>[]; edges: Edge<SearchFlowEdgeData>[] } {
  const visible = visibleNodeIds(nodes, options.archetypeOnly);

  const groups = groupEdgesByEffect(
    edges
      .filter((edge) => isVisibleEdge(edge, options.hiddenKinds))
      .filter((edge) => visible.has(edge.from) && visible.has(edge.to)),
  );
  const byCard = groupsByCard(groups.values());

  const rootId = nodes.find((node) => node.isRoot && visible.has(node.id))?.id;
  const { cardRanks, effectRanks } = reachable(
    rootId,
    byCard,
    options.openEffectIds,
  );

  const flowNodes: Node<SearchFlowNodeData>[] = [];

  for (const node of nodes) {
    const rank = cardRanks.get(node.id);
    if (rank === undefined) continue;

    flowNodes.push({
      id: node.id,
      type: "cardNode",
      position: { x: 0, y: 0 }, // replaced by layoutGraph
      data: {
        kind: "card",
        rank,
        node,
        isExpanded: options.expandedIds?.has(node.id) ?? false,
        hasEffects: !!byCard.get(node.id)?.length,
        canPeek: options.canPeek ?? false,
        isPeekLocked: options.lockedCardId === node.card.id,
      },
    });
  }

  for (const group of groups.values()) {
    const rank = effectRanks.get(group.id);
    if (rank === undefined) continue;

    flowNodes.push({
      id: group.id,
      type: "effectNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "effect",
        rank,
        effect: group,
        isOpen: options.openEffectIds?.has(group.id) ?? false,
      },
    });
  }

  const flowEdges: Edge<SearchFlowEdgeData>[] = [];

  for (const group of groups.values()) {
    if (!effectRanks.has(group.id)) continue;
    const style = edgeStyleFor(group.kinds);

    // Card -> effect. Unlabelled: the sentence is the node it points at.
    flowEdges.push({
      id: `${group.id}#in`,
      source: group.from,
      target: group.id,
      type: "searchEdge",
      data: { effect: group },
      style: {
        stroke: style.stroke,
        strokeWidth: 2,
        ...(style.dash ? { strokeDasharray: style.dash } : {}),
      },
    });

    for (const edge of group.edges) {
      if (!cardRanks.has(edge.to)) continue;
      const edgeStyle = edgeStyleFor(edge.kinds as SearchKind[]);

      flowEdges.push({
        id: edge.id,
        source: group.id,
        target: edge.to,
        type: "searchEdge",
        data: { edge, effect: group },
        style: {
          stroke: edgeStyle.stroke,
          strokeWidth: 2,
          ...(edgeStyle.dash ? { strokeDasharray: edgeStyle.dash } : {}),
        },
        markerEnd: {
          type: "arrowclosed" as const,
          color: edgeStyle.stroke,
          width: 18,
          height: 18,
        },
      });
    }
  }

  return { nodes: flowNodes, edges: flowEdges };
}
