"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { SearchFlowEdgeData } from "../../utils/toFlowElements";

export type SearchEdgeProps = EdgeProps & { data?: SearchFlowEdgeData };

/**
 * A plain coloured arrow.
 *
 * The kind, the cost and the sentence all moved onto the effect node, which
 * states them once instead of once per target. The only thing left that
 * belongs to a single arrow is the alias: without it the node reads as a bug,
 * a search for "Fallen of Albaz" landing on a card called something else.
 */
function SearchEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: SearchEdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const alias = data?.edge?.matchedAlias;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />

      {alias && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {/*
              Deliberately neutral rather than another hue - it annotates the
              target, it is not another kind of access.
            */}
            <span
              title={`Treated as "${alias}"`}
              className="inline-flex items-center gap-0.5 rounded border border-border bg-background/85 px-1 py-0.5 text-[10px] leading-none text-muted-foreground backdrop-blur-sm"
            >
              as
              <span className="font-medium text-foreground italic">
                &quot;{alias}&quot;
              </span>
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const SearchEdge = memo(SearchEdgeComponent);
