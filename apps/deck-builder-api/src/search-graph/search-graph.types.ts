import type {
  EffectDestination,
  ZoneRef,
} from '../card-effect-parser/card-effect.types';
import type { SearchKind, SearchVerb } from './search-effect';

/** A card tile on the graph. */
export interface SearchGraphCard {
  id: number;
  ygoId: number;
  name: string;
  cardType: string;
  frameType: string;
  archetype?: string | null;
  banStatusTcg?: string | null;
  banStatusOcg?: string | null;
  imageUrl?: string | null;
  imageUrlSmall?: string | null;
  imageUrlCropped?: string | null;
}

export interface SearchGraphNode {
  /** `card:<id>` — the Prisma card id, namespaced. */
  id: string;
  depth: number;
  isRoot: boolean;
  /**
   * Has both an inbound and an outbound edge, i.e. it is a link in a chain.
   * This is the "chained/domino search" category — a graph property, not
   * something the parser could know from one card's text.
   */
  isChainLink: boolean;
  card: SearchGraphCard;
}

export interface SearchGraphEdge {
  id: string;
  from: string;
  to: string;
  verb: SearchVerb;
  kinds: SearchKind[];
  sourceZones: ZoneRef[];
  destination?: EffectDestination;
  optional: boolean;
  costs: string[];
  restrictions: string[];
  /**
   * The other name the target answers to, when that is what made it a match -
   * "Fallen of the White Dragon" reached by a search for "Fallen of Albaz".
   * Without it the node looks like a bug.
   */
  matchedAlias?: string;
  /** The exact sentence this edge came from. Shown on hover. */
  sourceText: string;
}

export interface SearchGraphTruncation {
  byDepth: boolean;
  depth: number;
}

export interface SearchGraph {
  rootId: string;
  nodes: SearchGraphNode[];
  edges: SearchGraphEdge[];
  truncated: SearchGraphTruncation;
  parserVersion: number;
}

export interface SearchGraphOptions {
  depth: number;
  archetypeOnly: boolean;
  includeSelfLoops: boolean;
  kinds?: SearchKind[];
  /** Node ids the client already holds; omitted from `nodes`, kept in `edges`. */
  known?: string[];
}

export const DEFAULT_OPTIONS: SearchGraphOptions = {
  depth: 2,
  archetypeOnly: false,
  includeSelfLoops: false,
};
