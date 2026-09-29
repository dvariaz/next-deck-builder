"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SearchGraphResponseDto } from "@/generated/model";
import {
  getSearchGraphControllerBuildQueryKey,
  searchGraphControllerExpand,
  useSearchGraphControllerBuild,
} from "@/generated/api/cards/cards";
import {
  markChainLinks,
  mergeGraph,
  type MergedGraph,
} from "../../utils/mergeGraph";
import { useSearchGraphStore } from "../useSearchGraphStore/useSearchGraphStore";

/**
 * Loads a card's search graph and grows it in place.
 *
 * The base graph comes from React Query; expansions are merged into local
 * state rather than refetched, which is what the `known` parameter on the
 * expand endpoint exists for.
 *
 * Two kinds of "open" live here, and they are not the same thing:
 * `openEffectIds` reveals cards already fetched, instantly; `expandedIds`
 * records the cards we have gone back to the server for.
 */
export function useSearchGraph(cardId: number | null | undefined) {
  const depth = useSearchGraphStore.use.depth();

  const params = { depth };

  const query = useSearchGraphControllerBuild(cardId ?? 0, params, {
    query: {
      queryKey: getSearchGraphControllerBuildQueryKey(cardId ?? 0, params),
      enabled: cardId != null,
      staleTime: 5 * 60 * 1000,
    },
  });

  const [graph, setGraph] = useState<MergedGraph | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [openEffectIds, setOpenEffectIds] = useState<Set<string>>(new Set());
  const [isExpanding, setIsExpanding] = useState(false);

  const base = query.data?.data as SearchGraphResponseDto | undefined;

  // A new root or depth replaces the graph outright - expansions from the
  // previous shape no longer belong to it.
  useEffect(() => {
    if (!base) {
      setGraph(null);
      setExpandedIds(new Set());
      setOpenEffectIds(new Set());
      return;
    }
    setGraph(
      markChainLinks({
        rootId: base.rootId,
        nodes: base.nodes,
        edges: base.edges,
      }),
    );
    setExpandedIds(new Set());
    // Every card opens collapsed: the first thing on screen is what the card
    // does, not every card it can reach.
    setOpenEffectIds(new Set());
  }, [base]);

  const applyDelta = useCallback((delta: SearchGraphResponseDto) => {
    setGraph((current) =>
      current
        ? markChainLinks(
            mergeGraph(current, { nodes: delta.nodes, edges: delta.edges }),
          )
        : markChainLinks({
            rootId: delta.rootId,
            nodes: delta.nodes,
            edges: delta.edges,
          }),
    );
  }, []);

  const knownIds = useMemo(
    () => graph?.nodes.map((node) => node.id) ?? [],
    [graph],
  );

  /** Expand a card node one more tier. */
  const expandCard = useCallback(
    async (nodeId: string, targetCardId: number) => {
      setIsExpanding(true);
      try {
        const response = await searchGraphControllerExpand({
          cardId: targetCardId,
          depth: 1,
          known: knownIds,
        });
        applyDelta(response.data);
        setExpandedIds((ids) => new Set(ids).add(nodeId));
      } finally {
        setIsExpanding(false);
      }
    },
    [applyDelta, knownIds],
  );

  /** Show or hide one effect's target cards. Purely local. */
  const toggleEffect = useCallback((effectId: string) => {
    setOpenEffectIds((ids) => {
      const next = new Set(ids);
      if (!next.delete(effectId)) next.add(effectId);
      return next;
    });
  }, []);

  const rootArchetype =
    graph?.nodes.find((node) => node.isRoot)?.card?.archetype ?? null;

  return {
    graph,
    rootArchetype,
    expandedIds,
    openEffectIds,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isExpanding,
    truncated: base?.truncated,
    expandCard,
    toggleEffect,
  };
}
