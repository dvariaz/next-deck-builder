import type {
  CardFrameType,
  CardType,
  MonsterEffectType,
  SpellTrapSubType,
  SummonType,
} from '../../generated/prisma/enums';

/**
 * Structured intermediate representation of a Yu-Gi-Oh card's effect text.
 *
 * This module is the contract between the parser and every consumer of it.
 * It is deliberately framework-free: no Nest, no Prisma client, no decorators,
 * so the parser can also run under `tsx` in the batch script.
 *
 * Bump PARSER_VERSION whenever the shape or the parsing rules change in a way
 * that makes previously persisted `Card.cardEffects` rows wrong. The graph
 * service compares it and re-parses live on mismatch, so a bump is safe but
 * costs a live parse until `yarn effects:parse` runs again.
 */
export const PARSER_VERSION = 1;

/** What the player does. Only the first four are "search" verbs. */
export const EffectVerb = {
  ADD: 'ADD',
  SPECIAL_SUMMON: 'SPECIAL_SUMMON',
  NORMAL_SUMMON: 'NORMAL_SUMMON',
  SET: 'SET',
  SEND: 'SEND',
  BANISH: 'BANISH',
  DRAW: 'DRAW',
  EXCAVATE: 'EXCAVATE',
  REVEAL: 'REVEAL',
  RETURN: 'RETURN',
  DESTROY: 'DESTROY',
  NEGATE: 'NEGATE',
  SHUFFLE: 'SHUFFLE',
  PLACE: 'PLACE',
  ATTACH: 'ATTACH',
  EQUIP: 'EQUIP',
  TRIBUTE: 'TRIBUTE',
  DISCARD: 'DISCARD',
} as const;
export type EffectVerb = (typeof EffectVerb)[keyof typeof EffectVerb];

/**
 * Where cards come from. Zone and owner are orthogonal — every zone has a
 * "your"/"your opponent's"/"either" variant — so they are separate fields
 * rather than a doubled enum.
 */
export const EffectZone = {
  DECK: 'DECK',
  HAND: 'HAND',
  GY: 'GY',
  EXTRA_DECK: 'EXTRA_DECK',
  BANISHED: 'BANISHED',
  FIELD: 'FIELD',
  MONSTER_ZONE: 'MONSTER_ZONE',
  ST_ZONE: 'ST_ZONE',
  PENDULUM_ZONE: 'PENDULUM_ZONE',
  FIELD_ZONE: 'FIELD_ZONE',
} as const;
export type EffectZone = (typeof EffectZone)[keyof typeof EffectZone];

export type ZoneOwner = 'SELF' | 'OPPONENT' | 'EITHER';

export interface ZoneRef {
  zone: EffectZone;
  owner: ZoneOwner;
}

/** Where cards end up. Face-up vs face-down is the Set/Summon distinction. */
export const EffectDestination = {
  HAND: 'HAND',
  FIELD_FACE_UP: 'FIELD_FACE_UP',
  FIELD_FACE_DOWN: 'FIELD_FACE_DOWN',
  GY: 'GY',
  BANISHED: 'BANISHED',
  DECK: 'DECK',
  EXTRA_DECK: 'EXTRA_DECK',
  PENDULUM_ZONE: 'PENDULUM_ZONE',
  REVEALED: 'REVEALED',
} as const;
export type EffectDestination =
  (typeof EffectDestination)[keyof typeof EffectDestination];

/**
 * A description of which cards an action can affect, expressed only in terms
 * of queryable Card columns so it can be turned into a Prisma `where`.
 *
 * `archetype` is an EXACT match (the parser validates it against the DB's
 * archetype vocabulary first). `nameContains` is the degraded fallback when a
 * quoted token is not a known archetype.
 */
export interface EffectPredicate {
  cardType?: CardType[];
  /**
   * Rarely the right field: the seeder collapses every Pendulum variant
   * (`fusion_pendulum`, `xyz_pendulum`, ...) to `PENDULUM`, so 32 Extra Deck
   * monsters have a frameType that does not name their summon class. Use
   * `summonType` for "Fusion/Synchro/Xyz/Link Monster" and `isPendulum` for
   * "Pendulum Monster".
   */
  frameType?: CardFrameType[];
  summonType?: SummonType[];
  monsterEffectType?: MonsterEffectType[];
  spellTrapSubType?: SpellTrapSubType[];
  archetype?: string;
  nameContains?: string;
  attribute?: string[];
  race?: string[];
  levelMin?: number;
  levelMax?: number;
  linkValMin?: number;
  linkValMax?: number;
  atkMin?: number;
  atkMax?: number;
  defMin?: number;
  defMax?: number;
  isTuner?: boolean;
  isPendulum?: boolean;
  isEffect?: boolean;
  /** From `except "X"` clauses. Never applied as a top-level `where.NOT`. */
  excludeNames?: string[];
}

export type EffectTarget =
  /** One or more specific cards, by exact name. */
  | { kind: 'named'; names: string[] }
  /** "this card" — resolves to the card being parsed. */
  | { kind: 'self' }
  /**
   * A description rather than a name. `label` is Konami's verbatim noun
   * phrase and is what the UI renders — never reconstruct it from `predicate`.
   */
  | { kind: 'criteria'; predicate: EffectPredicate; label: string }
  /** Recognised as an action, but the target could not be pinned down. */
  | { kind: 'unresolved'; text: string };

export type EffectQuantity = { min: number; max: number } | 'ANY';

export interface EffectAction {
  verb: EffectVerb;
  /** Empty when the text names no zone. Multiple for "from your hand or Deck". */
  sourceZones: ZoneRef[];
  destination?: EffectDestination;
  target: EffectTarget;
  quantity: EffectQuantity;
  /**
   * True only when the target is fully pinned down (`named`, `self`, or a
   * `criteria` with at least one constrained field). The search graph draws
   * edges for resolved actions only.
   */
  resolved: boolean;
  /** The exact clause this came from. Shown on hover; makes bugs self-diagnosing. */
  sourceText: string;
}

export interface EffectCost {
  discard?: number | 'ANY';
  tribute?: number | 'ANY';
  banish?: number | 'ANY';
  /** Deck thinning paid as a cost, e.g. "send 1 card from your Deck to the GY". */
  sendDeckToGy?: number | 'ANY';
  payLifePoints?: number;
  /** Verbatim cost clauses that were recognised but not modelled. */
  other?: string[];
}

export interface EffectRestrictions {
  /**
   * Name-locked once per turn: "You can only use this/each effect of "X" once
   * per turn", "You can only activate 1 "X" per turn". Limits the whole play,
   * not just this copy.
   */
  hardOncePerTurn?: {
    scope: 'EFFECT' | 'ACTIVATION' | 'SUMMON';
    name?: string;
  };
  /** Bare "Once per turn" — limited per copy, not by name. */
  softOncePerTurn?: boolean;
  /** From `except "X"`. Also mirrored onto criteria predicates. */
  exceptNames: string[];
  /** Verbatim display-only clauses: summon locks, phase locks, archetype locks. */
  labels: string[];
}

/** Which part of the card text an effect came from. */
export type EffectBlockKind = 'MAIN' | 'PENDULUM' | 'MONSTER' | 'BULLET';

export interface CardEffect {
  /** Stable within a card: `${blockIndex}.${sentenceIndex}`. */
  id: string;
  blockKind: EffectBlockKind;
  /**
   * The PSCT activation condition (text before `:`). Never yields actions —
   * this is what stops "If this card is sent to the GY:" becoming an edge.
   */
  trigger?: { text: string };
  cost: EffectCost;
  actions: EffectAction[];
  restrictions: EffectRestrictions;
  /** "You can ..." — an optional effect rather than a mandatory one. */
  optional: boolean;
  sourceText: string;
}

/** The shape persisted in `Card.cardEffects`. */
export interface ParsedCardEffects {
  version: number;
  parsedAt: string;
  /**
   * How this row was produced. The rules batch script must never overwrite a
   * row whose origin is not RULES unless forced — that is what protects a
   * future LLM or manual pass from being clobbered by a re-parse.
   */
  origin: 'RULES' | 'LLM' | 'MANUAL';
  effects: CardEffect[];
  /** Clauses that looked like effects but did not parse. Feeds the review queue. */
  unparsed: string[];
  needsReview: boolean;
}

/**
 * Vocabulary the parser needs but cannot know statically. Injected rather than
 * queried so the parser stays pure and specs can run on a small fixture set.
 */
export interface ParserContext {
  /** `SELECT DISTINCT archetype` — 650 values in the current pool. */
  archetypes: ReadonlySet<string>;
  /** `SELECT DISTINCT race` for monsters — 27 values. */
  races: ReadonlySet<string>;
  /** The name of the card being parsed, for "this card" and OPT matching. */
  cardName: string;
}

/** The verbs the search graph projects edges from. */
export const SEARCH_VERBS: readonly EffectVerb[] = [
  EffectVerb.ADD,
  EffectVerb.SPECIAL_SUMMON,
  EffectVerb.NORMAL_SUMMON,
  EffectVerb.SET,
];
