"use client";

import { AlertCircle, Loader2, Maximize2, Network } from "lucide-react";
import { SearchGraphCanvas } from "../../components/SearchGraphCanvas/SearchGraphCanvas";
import { Button } from "@/modules/common/components/Button/Button";
import type { SearchGraphCardDto } from "@/generated/model";
import { useSearchGraph } from "../../hooks/useSearchGraph/useSearchGraph";
import { useSearchGraphStore } from "../../hooks/useSearchGraphStore/useSearchGraphStore";

interface SearchGraphPanelProps {
  cardId: number | null;
  onOpenFullScreen?: () => void;
  onSelectCard?: (cardId: number) => void;
  /** Given when the surrounding layout has an image pane to peek into. */
  onPeekCard?: (card: SearchGraphCardDto | null) => void;
  /** Pin or unpin the hovered preview, so it outlives the pointer. */
  onTogglePeekLock?: (card: SearchGraphCardDto) => void;
  /** Card id currently pinned into that pane. */
  lockedCardId?: number | null;
}

/** Wires the store, the data hook and the canvas together. */
export function SearchGraphPanel({
  cardId,
  onOpenFullScreen,
  onSelectCard,
  onPeekCard,
  onTogglePeekLock,
  lockedCardId,
}: SearchGraphPanelProps) {
  const archetypeOnly = useSearchGraphStore.use.archetypeOnly();
  const hiddenKinds = useSearchGraphStore.use.hiddenKinds();

  const {
    graph,
    rootArchetype,
    expandedIds,
    openEffectIds,
    isLoading,
    isError,
    isExpanding,
    truncated,
    expandCard,
    toggleEffect,
  } = useSearchGraph(cardId);

  const hasGraph = !!graph && graph.nodes.length > 0;
  const hasEdges = !!graph && graph.edges.length > 0;

  return (
    <div className="relative h-full min-h-0">
      {onOpenFullScreen && (
        <Button
          variant="outline"
          size="sm"
          className="absolute top-2 left-2 z-10 h-7 gap-1.5 bg-card/90 text-xs backdrop-blur-sm"
          onClick={onOpenFullScreen}
        >
          <Maximize2 className="h-3 w-3" />
          Full screen
        </Button>
      )}

      {isLoading && (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building the search graph...
        </div>
      )}

      {isError && (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          Could not build the search graph.
        </div>
      )}

      {!isLoading && !isError && hasGraph && !hasEdges && (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
          <Network className="h-6 w-6" />
          <p>This card does not search anything we can resolve.</p>
          <p className="text-xs">
            Summons and searches with a target we cannot pin down are left out
            on purpose, rather than guessed at.
          </p>
        </div>
      )}

      {!isLoading && !isError && hasGraph && hasEdges && (
        <SearchGraphCanvas
          graph={graph}
          expandedIds={expandedIds}
          openEffectIds={openEffectIds}
          hiddenKinds={hiddenKinds}
          archetypeOnly={archetypeOnly ? rootArchetype : null}
          onExpandCard={expandCard}
          onToggleEffect={toggleEffect}
          onSelectCard={onSelectCard}
          onPeekCard={onPeekCard}
          onTogglePeekLock={onTogglePeekLock}
          lockedCardId={lockedCardId}
        />
      )}

      {isExpanding && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          Expanding
        </div>
      )}

      {truncated?.byDepth && hasEdges && (
        <div className="absolute right-2 bottom-2 z-10 rounded-md border border-border bg-card/85 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
          More tiers available
        </div>
      )}
    </div>
  );
}
