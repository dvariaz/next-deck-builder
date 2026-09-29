"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeMouseHandler,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { SearchGraphCardDto, SearchKind } from "@/generated/model";
import type { MergedGraph } from "../../utils/mergeGraph";
import { anchorLayout } from "../../utils/anchorLayout";
import { layoutGraph } from "../../utils/layoutGraph";
import {
  toFlowElements,
  type SearchFlowNodeData,
} from "../../utils/toFlowElements";
import { CardNode } from "../CardNode/CardNode";
import { EffectNode } from "../EffectNode/EffectNode";
import { SearchEdge } from "../SearchEdge/SearchEdge";
import { SearchGraphLegend } from "../SearchGraphLegend/SearchGraphLegend";

// Defined at module scope: React Flow warns (and remounts every node) if these
// object identities change between renders.
const NODE_TYPES = { cardNode: CardNode, effectNode: EffectNode };
const EDGE_TYPES = { searchEdge: SearchEdge };

interface SearchGraphCanvasProps {
  graph: MergedGraph;
  expandedIds: Set<string>;
  openEffectIds: Set<string>;
  hiddenKinds: SearchKind[];
  archetypeOnly: string | null;
  onExpandCard: (nodeId: string, cardId: number) => void;
  onToggleEffect: (effectId: string) => void;
  onSelectCard?: (cardId: number) => void;
  /**
   * Show this card in the surrounding image pane, without leaving the graph.
   * Called with `null` when the pointer leaves, so the pane can fall back.
   */
  onPeekCard?: (card: SearchGraphCardDto | null) => void;
  /** Pin or unpin this card's preview, so it outlives the hover. */
  onTogglePeekLock?: (card: SearchGraphCardDto) => void;
  /** Card id currently pinned, so its node can say so. */
  lockedCardId?: number | null;
}

function Canvas({
  graph,
  expandedIds,
  openEffectIds,
  hiddenKinds,
  archetypeOnly,
  onExpandCard,
  onToggleEffect,
  onSelectCard,
  onPeekCard,
  onTogglePeekLock,
  lockedCardId,
}: SearchGraphCanvasProps) {
  /**
   * The node the user last acted on, and where every node sat before that.
   *
   * Dagre re-lays the whole graph on every toggle, so opening an effect that
   * adds eight cards grows the graph and slides the existing nodes - the root
   * included - out from under a viewport that has not moved. Refs rather than
   * state: neither is an input to rendering, and rewriting the positions
   * inside the memo is idempotent, so a StrictMode double-invoke lands on the
   * same layout.
   */
  const anchorRef = useRef<string | null>(null);
  const positionsRef = useRef<Map<string, XYPosition>>(new Map());

  const { nodes, edges } = useMemo(() => {
    const elements = toFlowElements(graph.nodes, graph.edges, {
      expandedIds,
      openEffectIds,
      hiddenKinds: new Set(hiddenKinds),
      archetypeOnly,
      canPeek: !!onTogglePeekLock,
      lockedCardId,
    });

    const laid = anchorLayout(
      layoutGraph(elements.nodes, elements.edges),
      positionsRef.current,
      anchorRef.current,
    );
    positionsRef.current = new Map(
      laid.map((node) => [node.id, node.position]),
    );

    return { nodes: laid, edges: elements.edges };
  }, [
    graph,
    expandedIds,
    openEffectIds,
    hiddenKinds,
    archetypeOnly,
    onTogglePeekLock,
    lockedCardId,
  ]);

  /**
   * A different card is a different graph, and `fitView` as a prop only runs
   * at init, so frame it explicitly.
   *
   * This must NOT clear the refs above. Effects run after the render that
   * filled them, so clearing here empties the position map immediately after
   * the first layout writes it, and the next re-layout has nothing to anchor
   * to - which is the whole bug this was meant to fix. Stale entries are
   * harmless: a new root either shares no ids (no translation at all) or
   * anchors to a carried-over node, and this `fitView` reframes either way.
   */
  const { fitView } = useReactFlow();
  useEffect(() => {
    void fitView({ padding: 0.2, maxZoom: 1 });
  }, [graph.rootId, fitView]);

  /**
   * One click handler rather than callbacks threaded through node data: node
   * data is memoized per node, and passing fresh closures into it would
   * re-render every node on every parent render.
   */
  const handleNodeClick = useCallback<NodeMouseHandler>(
    (event, node) => {
      const data = (node as Node<SearchFlowNodeData>).data;

      // Hold whatever was clicked still through the re-layout it triggers.
      anchorRef.current = node.id;

      if (data.kind === "effect") {
        onToggleEffect(data.effect.id);
        return;
      }

      const target = event.target as HTMLElement;
      if (target.closest("[data-expand]")) {
        onExpandCard(data.node.id, data.node.card.id);
        return;
      }

      if (target.closest("[data-peek-lock]")) {
        onTogglePeekLock?.(data.node.card);
        return;
      }

      onSelectCard?.(data.node.card.id);
    },
    [onExpandCard, onToggleEffect, onSelectCard, onTogglePeekLock],
  );

  /**
   * Hovering a card node previews it in the surrounding pane.
   *
   * React Flow gives us enter/leave per node, so a pointer moving straight
   * from one card to the next fires leave-then-enter and the pane settles on
   * the new card. Whether the preview actually changes is the pane's call —
   * a pinned preview ignores these.
   *
   * The root is skipped: the pane is already showing that card, so previewing
   * it would only banner the same art as something on loan.
   */
  const handleNodeMouseEnter = useCallback<NodeMouseHandler>(
    (_event, node) => {
      const data = (node as Node<SearchFlowNodeData>).data;
      if (data.kind !== "card" || data.node.isRoot) return;
      onPeekCard?.(data.node.card);
    },
    [onPeekCard],
  );

  const handleNodeMouseLeave = useCallback<NodeMouseHandler>(
    (_event, node) => {
      const data = (node as Node<SearchFlowNodeData>).data;
      if (data.kind !== "card" || data.node.isRoot) return;
      onPeekCard?.(null);
    },
    [onPeekCard],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodeClick={handleNodeClick}
      onNodeMouseEnter={handleNodeMouseEnter}
      onNodeMouseLeave={handleNodeMouseLeave}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.15}
      maxZoom={1.5}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: true }}
      className="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls
        showInteractive={false}
        position="top-right"
        orientation="horizontal"
        className="overflow-hidden rounded-md! border! border-border! bg-card/90! shadow-none! backdrop-blur-sm"
        style={
          {
            "--xy-controls-button-background-color": "var(--card)",
            "--xy-controls-button-background-color-hover": "var(--muted)",
            "--xy-controls-button-color": "var(--muted-foreground)",
            "--xy-controls-button-color-hover": "var(--foreground)",
            "--xy-controls-button-border-color": "var(--border)",
          } as CSSProperties
        }
      />
      <MiniMap
        pannable
        zoomable
        className="overflow-hidden rounded-md! border! border-border! bg-card/90! backdrop-blur-sm"
        maskColor="rgba(0,0,0,0.6)"
        nodeColor={(node) => {
          const data = (node as Node<SearchFlowNodeData>).data;
          if (data?.kind === "effect") return "#52525b";
          return data?.node?.isRoot ? "#22d3ee" : "#3f3f46";
        }}
        style={
          {
            "--xy-minimap-background-color": "var(--card)",
          } as CSSProperties
        }
      />
      <SearchGraphLegend canPeek={!!onPeekCard} />
    </ReactFlow>
  );
}

/**
 * React Flow needs its provider and an explicitly sized container — it
 * measures the pane, and a zero-height parent renders an empty canvas.
 */
export function SearchGraphCanvas(props: SearchGraphCanvasProps) {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <Canvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
