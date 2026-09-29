import { SearchKind } from "@/generated/model";

/**
 * Colour and wording for search kinds.
 *
 * The label lives on the EFFECT node, not on the card: a kind describes how a
 * given sentence reaches its targets. The same card can be reached by two
 * different means from two different parents, so a badge on the card tile
 * would have to show contradictory kinds or arbitrarily pick one.
 *
 * Badge classes follow the existing convention in CardTypeBadge/AttributeBadge
 * (`bg-<c>-500/20 text-<c>-300 border-<c>-500/30`). `stroke` is a literal
 * colour because SVG edge paths cannot take a Tailwind class.
 */

export interface SearchKindStyle {
  /** Short wording for the badge. */
  label: string;
  badge: string;
  stroke: string;
  dash?: string;
}

const STYLES: Record<SearchKind, SearchKindStyle> = {
  DECK_SEARCH: {
    label: "Add from Deck",
    badge: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    stroke: "#22d3ee",
  },
  GY_SALVAGE: {
    label: "Add from GY",
    badge: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    stroke: "#2dd4bf",
  },
  BANISH_RETRIEVAL: {
    label: "Add from banished",
    badge: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    stroke: "#2dd4bf",
  },
  DECK_SUMMON: {
    label: "SS from Deck",
    badge: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    stroke: "#a78bfa",
  },
  REVIVAL: {
    label: "SS from GY",
    badge: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    stroke: "#a78bfa",
  },
  HAND_EXTENDER: {
    label: "SS from hand",
    badge: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    stroke: "#a78bfa",
  },
  EXTRA_DECK_ACCESS: {
    label: "Extra Deck",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    stroke: "#34d399",
  },
  SET_FROM_DECK: {
    label: "Set from Deck",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    stroke: "#60a5fa",
    dash: "6 4",
  },
  EXTRA_NORMAL_SUMMON: {
    label: "Extra Normal Summon",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    stroke: "#fbbf24",
  },
  WITH_COST: {
    label: "Has cost",
    badge: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
    stroke: "#a1a1aa",
    dash: "2 3",
  },
  OPPONENT_ZONE: {
    label: "Opponent's zone",
    badge: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    stroke: "#f472b6",
  },
};

/**
 * Modifiers describe how a search is paid for or whose cards it touches, not
 * what kind of access it is. They earn a badge but must not drive the edge
 * colour, or every costed search would look identical.
 */
const MODIFIERS: SearchKind[] = ["WITH_COST", "OPPONENT_ZONE"];

/** Most specific first, so a multi-kind edge picks a meaningful colour. */
const PRIORITY: SearchKind[] = [
  "EXTRA_DECK_ACCESS",
  "DECK_SEARCH",
  "DECK_SUMMON",
  "SET_FROM_DECK",
  "REVIVAL",
  "GY_SALVAGE",
  "BANISH_RETRIEVAL",
  "HAND_EXTENDER",
  "EXTRA_NORMAL_SUMMON",
  "WITH_COST",
  "OPPONENT_ZONE",
];

const FALLBACK: SearchKindStyle = {
  label: "Search",
  badge: "bg-muted/50 text-muted-foreground border-border",
  stroke: "#a1a1aa",
};

export function styleForKind(kind: SearchKind): SearchKindStyle {
  return STYLES[kind] ?? FALLBACK;
}

/** The kind that drives an edge's colour and dash pattern. */
export function primaryKind(kinds: SearchKind[]): SearchKind | undefined {
  const substantive = kinds.filter((kind) => !MODIFIERS.includes(kind));
  const pool = substantive.length ? substantive : kinds;
  return PRIORITY.find((kind) => pool.includes(kind)) ?? pool[0];
}

export function edgeStyleFor(kinds: SearchKind[]): SearchKindStyle {
  const primary = primaryKind(kinds);
  return primary ? styleForKind(primary) : FALLBACK;
}

/** Kinds in display order, so a multi-kind label reads consistently. */
export function orderKinds(kinds: SearchKind[]): SearchKind[] {
  return PRIORITY.filter((kind) => kinds.includes(kind));
}

export const ALL_SEARCH_KINDS = PRIORITY;
