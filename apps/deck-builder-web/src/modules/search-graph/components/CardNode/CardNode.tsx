"use client";

import Image from "next/image";
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Pin, PinOff, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BanlistStatusIcon } from "@/modules/common/components/BanlistStatusIcon/BanlistStatusIcon";
import { CARD_NODE_SIZE } from "../../utils/layoutGraph";
import type { CardFlowNodeData } from "../../utils/toFlowElements";

export type CardNodeProps = NodeProps & { data: CardFlowNodeData };

/**
 * Deliberately minimal: image, name, an expand handle and a pin button.
 *
 * Only intrinsic markers appear here — root ring, banlist icon. Everything
 * relational lives on the effect node it points at.
 */
function CardNodeComponent({ data }: CardNodeProps) {
  const { node, isExpanded, hasEffects, canPeek, isPeekLocked } = data;
  const card = node.card;

  const image = card.imageUrlSmall ?? card.imageUrl;
  const banStatus = card.banStatusTcg;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-lg border bg-card overflow-hidden",
        node.isRoot
          ? "border-primary ring-2 ring-primary/40"
          : "border-border hover:border-primary/50",
        // The pinned card stays marked once the pointer moves on, or nothing
        // on the canvas would say where the preview came from.
        isPeekLocked && !node.isRoot && "border-primary/70",
      )}
      style={{ width: CARD_NODE_SIZE.width, height: CARD_NODE_SIZE.height }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground !border-background"
      />

      <div className="relative flex-1 bg-black/30">
        {image ? (
          <Image
            src={image}
            alt={card.name}
            fill
            sizes="168px"
            className="object-contain"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No Image
          </div>
        )}

        {banStatus && banStatus !== "UNLIMITED" && (
          <BanlistStatusIcon
            status={banStatus as "FORBIDDEN" | "LIMITED" | "SEMI_LIMITED"}
            className="absolute top-1 left-1 z-10"
          />
        )}

        {/*
          Hovering the node already previews it in the image pane; this button
          pins that preview so it survives the pointer leaving. Only rendered
          where there is a pane listening.

          Kept visible while pinned: an opacity-0 control would hide the only
          way back out of the pinned state. Never on the root - the pane is
          already showing that card.
        */}
        {canPeek && !node.isRoot && (
          <button
            type="button"
            data-peek-lock={card.id}
            title={
              isPeekLocked
                ? `Unpin ${card.name} from the preview`
                : `Pin ${card.name} to the preview`
            }
            aria-label={
              isPeekLocked
                ? `Unpin ${card.name} from the preview`
                : `Pin ${card.name} to the preview`
            }
            aria-pressed={isPeekLocked}
            className={cn(
              "nodrag absolute top-1 right-1 z-20 rounded-full border p-1 backdrop-blur-sm transition-opacity hover:text-primary group-hover:opacity-100 focus-visible:opacity-100",
              isPeekLocked
                ? "border-primary bg-primary/20 text-primary opacity-100"
                : "border-border bg-card/90 text-muted-foreground opacity-0",
            )}
          >
            {isPeekLocked ? (
              <PinOff className="h-3 w-3" />
            ) : (
              <Pin className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-2 py-1.5">
        <p className="line-clamp-2 text-[11px] leading-tight font-medium text-foreground">
          {card.name}
        </p>
      </div>

      {/*
        Only when there is nothing left to open locally. A card that already
        has its effects on the canvas grows through those, not through a
        second fetch that would add the same tier again.
      */}
      {!isExpanded && !hasEffects && (
        <button
          type="button"
          data-expand={card.id}
          aria-label={`Show what ${card.name} searches`}
          className="nodrag absolute -right-2.5 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border bg-card p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground !border-background"
      />
    </div>
  );
}

export const CardNode = memo(CardNodeComponent);
