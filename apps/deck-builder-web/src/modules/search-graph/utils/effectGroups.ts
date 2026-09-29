import type { SearchGraphEdgeDto, SearchKind } from "@/generated/model";
import { orderKinds } from "./searchKindColors";

/**
 * One card sentence and everything it reaches.
 *
 * The graph used to hang this information off the arrows, which meant a card
 * with eight targets drew eight copies of the same sentence. Collapsing them
 * into a single node makes the first thing on screen "what this card does",
 * with the results a click away rather than eight fanned-out tiles.
 */
export interface EffectGroup {
  /** React Flow node id. */
  id: string;
  /** Node id of the card whose text this is. */
  from: string;
  /** The exact sentence this effect came from. */
  sourceText: string;
  /** Union of the kinds across the group's edges, in display order. */
  kinds: SearchKind[];
  costs: string[];
  /** True when any edge in the group is Hard Once Per Turn. */
  hardOncePerTurn: boolean;
  /** Target node ids, in the order the edges arrived. */
  targets: string[];
  edges: SearchGraphEdgeDto[];
}

/**
 * Keyed by the sentence rather than by the server's effect id, because the
 * sentence is what the node shows: two effects that render identically should
 * not stack two identical boxes on the canvas.
 */
const groupId = (edge: SearchGraphEdgeDto) =>
  `effect:${edge.from}|${edge.sourceText}`;

const HARD_OPT = "Hard once per turn";

/**
 * Bucket edges into one group per (source card, sentence).
 *
 * Insertion-ordered, so the layout is stable across re-renders and across an
 * expansion that appends new edges.
 */
export function groupEdgesByEffect(
  edges: SearchGraphEdgeDto[],
): Map<string, EffectGroup> {
  const groups = new Map<string, EffectGroup>();

  for (const edge of edges) {
    const id = groupId(edge);
    let group = groups.get(id);

    if (!group) {
      group = {
        id,
        from: edge.from,
        sourceText: edge.sourceText,
        kinds: [],
        costs: [],
        hardOncePerTurn: false,
        targets: [],
        edges: [],
      };
      groups.set(id, group);
    }

    group.edges.push(edge);
    if (!group.targets.includes(edge.to)) group.targets.push(edge.to);

    for (const kind of edge.kinds as SearchKind[]) {
      if (!group.kinds.includes(kind)) group.kinds.push(kind);
    }
    for (const cost of edge.costs) {
      if (!group.costs.includes(cost)) group.costs.push(cost);
    }
    group.hardOncePerTurn ||= edge.restrictions.some((r) =>
      r.startsWith(HARD_OPT),
    );
  }

  for (const group of groups.values()) {
    group.kinds = orderKinds(group.kinds);
  }

  return groups;
}

/** The groups belonging to each source card, for the reachability walk. */
export function groupsByCard(
  groups: Iterable<EffectGroup>,
): Map<string, EffectGroup[]> {
  const byCard = new Map<string, EffectGroup[]>();
  for (const group of groups) {
    const list = byCard.get(group.from) ?? [];
    list.push(group);
    byCard.set(group.from, list);
  }
  return byCard;
}
