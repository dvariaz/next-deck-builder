import { create } from "zustand";
import type { SearchKind } from "@/generated/model";
import { createSelectors } from "@/modules/common/utils/store";

/**
 * View preferences for the search graph.
 *
 * Only preferences live here, not the graph itself: these persist as the user
 * moves between cards, whereas the graph is per-root and belongs to the data
 * hook.
 */

export const MIN_DEPTH = 1;
export const MAX_DEPTH = 3;

interface SearchGraphState {
  depth: number;
  /** Hide nodes not sharing the root card's archetype. */
  archetypeOnly: boolean;
  /** Kinds the user has switched off. Applied client-side, so it is instant. */
  hiddenKinds: SearchKind[];

  setDepth: (depth: number) => void;
  toggleArchetypeOnly: () => void;
  toggleKind: (kind: SearchKind) => void;
  showAllKinds: () => void;
}

const useStoreBase = create<SearchGraphState>()((set) => ({
  depth: 2,
  archetypeOnly: false,
  hiddenKinds: [],

  setDepth: (depth) =>
    set({ depth: Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, depth)) }),

  toggleArchetypeOnly: () =>
    set((state) => ({ archetypeOnly: !state.archetypeOnly })),

  toggleKind: (kind) =>
    set((state) => ({
      hiddenKinds: state.hiddenKinds.includes(kind)
        ? state.hiddenKinds.filter((k) => k !== kind)
        : [...state.hiddenKinds, kind],
    })),

  showAllKinds: () => set({ hiddenKinds: [] }),
}));

export const useSearchGraphStore = createSelectors(useStoreBase);
