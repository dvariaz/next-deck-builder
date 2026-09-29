"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EFFECT_NODE_SIZE } from "../../utils/layoutGraph";
import type { EffectFlowNodeData } from "../../utils/toFlowElements";
import { SearchKindBadge } from "../SearchKindBadge/SearchKindBadge";

export type EffectNodeProps = NodeProps & { data: EffectFlowNodeData };

/**
 * One sentence of card text, and a button to see what it reaches.
 *
 * This is what the edge labels used to be. Hanging the text off the arrows
 * repeated it once per target and forced every result onto the canvas at
 * once; as a node it is stated once, and the results are opt-in.
 */
function EffectNodeComponent({ data }: EffectNodeProps) {
  const { effect, isOpen } = data;
  const count = effect.targets.length;
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border bg-card/95 p-2.5 transition-colors",
        isOpen ? "border-primary/50" : "border-border hover:border-primary/40",
      )}
      style={{
        width: EFFECT_NODE_SIZE.width,
        height: EFFECT_NODE_SIZE.height,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground !border-background"
      />

      <div className="flex flex-wrap gap-0.5">
        {effect.kinds.map((kind) => (
          <SearchKindBadge key={kind} kind={kind} />
        ))}

        {effect.hardOncePerTurn && (
          <span
            title="Hard Once Per Turn"
            className="inline-flex items-center rounded border border-orange-500/30 bg-orange-500/20 px-1 py-0.5 text-[10px] leading-none font-semibold text-orange-300"
          >
            HOPT
          </span>
        )}

        {effect.costs.map((cost) => (
          <span
            key={cost}
            className="inline-flex items-center rounded border border-border bg-muted/60 px-1 py-0.5 text-[10px] leading-none text-muted-foreground"
          >
            {cost}
          </span>
        ))}
      </div>

      {/* The verbatim sentence on hover, so an effect can always be audited. */}
      <p
        title={effect.sourceText}
        className="line-clamp-4 flex-1 text-[11px] leading-snug text-foreground"
      >
        {effect.sourceText}
      </p>

      {/* The whole node toggles; this is the affordance and the tab stop. */}
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={
          isOpen
            ? `Hide the ${count} cards this reaches`
            : `Show the ${count} cards this reaches`
        }
        className="nodrag flex w-full items-center justify-center gap-1 rounded border border-border bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <Chevron className="h-3 w-3" />
        {isOpen ? "Hide" : "Show"} {count} {count === 1 ? "card" : "cards"}
      </button>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground !border-background"
      />
    </div>
  );
}

export const EffectNode = memo(EffectNodeComponent);
