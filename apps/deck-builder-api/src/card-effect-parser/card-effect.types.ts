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
export const PARSER_VERSION = 3;

/**
 * The word a trigger condition opens with. This is not cosmetic — it decides
 * whether the effect can MISS THE TIMING, which is one of the few places where
 * Konami's wording maps directly onto a hard rule:
 *
 *   "When this card is sent to the GY: you can ..."  — misses the timing
 *   "If this card is sent to the GY: you can ..."    — never misses the timing
 *
 * An optional "When" trigger effect may only activate if its trigger was the
 * LAST thing to happen; if anything else resolved after it, the window is gone.
 * "If" effects have no such restriction. Mandatory effects do not miss timing
 * regardless of the word, so `missesTiming` needs the optional flag too.
 *
 * WHILE and DURING are continuous/ignition windows rather than trigger events,
 * and never miss the timing.
 */
export const TriggerTiming = {
  WHEN: 'WHEN',
  IF: 'IF',
  WHILE: 'WHILE',
  DURING: 'DURING',
  EACH_TIME: 'EACH_TIME',
  AFTER: 'AFTER',
} as const;
export type TriggerTiming = (typeof TriggerTiming)[keyof typeof TriggerTiming];

/**
 * How the effect picks what it acts on. Targeting is a distinct game action
 * with its own rules — a card that says "target" can be stopped by targeting
 * protection, and the choice is locked in at activation rather than resolution.
 *
 * The three positive values are kept apart rather than collapsed to a boolean
 * because legacy text genuinely is ambiguous: Konami's errata programme
 * rewrote pre-2011 "select" into either "target" or "choose" case by case, and
 * an un-errata'd card's printed text does not say which it became. Reporting
 * LEGACY_SELECT is honest; guessing `targets: true` would be wrong about half
 * the time.
 */
export const SelectionMode = {
  /** "target 1 monster" — explicit targeting (PSCT). */
  TARGET: 'TARGET',
  /** "choose 1 monster" — explicitly non-targeting (PSCT). */
  CHOOSE: 'CHOOSE',
  /** Pre-errata "select" — targeting status not determined by the text. */
  LEGACY_SELECT: 'LEGACY_SELECT',
  /** No selection language: the effect applies to whatever it describes. */
  NONE: 'NONE',
} as const;
export type SelectionMode = (typeof SelectionMode)[keyof typeof SelectionMode];

/**
 * The conjunction that introduced a resolution segment.
 *
 * Konami's conjunctions are a defined vocabulary, not prose, and they say
 * whether a later part still happens when an earlier part fails:
 *
 *   "then"            sequential;   the first is REQUIRED for the second
 *   "and if you do"   simultaneous; the first is REQUIRED for the second
 *   "also"            simultaneous; independent — do as much as possible
 *   "and"             simultaneous; all-or-nothing, both strictly required
 *
 * That difference is why the IR records it: an action behind "then" does not
 * happen at all if the clause before it failed, so it is a weaker claim about
 * what the card can reach than one behind "also".
 */
export const Conjunction = {
  /** The first segment of a resolution. Depends on nothing. */
  NONE: 'NONE',
  THEN: 'THEN',
  AND_IF_YOU_DO: 'AND_IF_YOU_DO',
  ALSO: 'ALSO',
  /**
   * Bare "and". Split only when a known action verb follows it, so that
   * "1 Warrior and 1 Spellcaster monster" stays one noun phrase.
   */
  AND: 'AND',
  AFTER_THAT: 'AFTER_THAT',
  /** ", but ..." — a qualification on what precedes, not a further action. */
  BUT: 'BUT',
} as const;
export type Conjunction = (typeof Conjunction)[keyof typeof Conjunction];

/**
 * Conjunctions whose segment does not happen at all if the preceding clause
 * failed.
 *
 * "then" and "and if you do" are stated as such by Konami. "after that" is
 * not covered there; it is included because it is purely sequential, and the
 * same reasoning applies.
 */
export const DEPENDENT_CONJUNCTIONS: readonly Conjunction[] = [
  Conjunction.THEN,
  Conjunction.AND_IF_YOU_DO,
  Conjunction.AFTER_THAT,
  // "and" is all-or-nothing: both halves are strictly required, so neither
  // happens unless both can.
  Conjunction.AND,
];

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
  // Discrete non-search actions. These resolve once rather than applying
  // continuously — a continuous state belongs in EffectModifier instead.
  INFLICT_DAMAGE: 'INFLICT_DAMAGE',
  GAIN_LP: 'GAIN_LP',
  LOSE_LP: 'LOSE_LP',
  TAKE_CONTROL: 'TAKE_CONTROL',
  CHANGE_POSITION: 'CHANGE_POSITION',
  FLIP: 'FLIP',
  PLACE_COUNTER: 'PLACE_COUNTER',
  REMOVE_COUNTER: 'REMOVE_COUNTER',
  DETACH: 'DETACH',
  TOSS_COIN: 'TOSS_COIN',
  ROLL_DICE: 'ROLL_DICE',
  DECLARE: 'DECLARE',
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
   * Whether the action targets. Read from the whole PSCT clause, not just the
   * resolution: modern text states the target in the cost half ("target 1
   * monster in your GY; Special Summon it").
   */
  selection: SelectionMode;
  /**
   * The magnitude, for verbs that carry one (INFLICT_DAMAGE, GAIN_LP,
   * LOSE_LP, PLACE_COUNTER, DRAW ...). 'VARIABLE' when the text computes it.
   */
  amount?: number | 'VARIABLE';
  /** The conjunction that introduced this action's segment. */
  conjunction: Conjunction;
  /**
   * True when this action does not happen at all if the preceding clause
   * failed — derived from `conjunction` via DEPENDENT_CONJUNCTIONS.
   */
  dependsOnPrevious: boolean;
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
  /** "Detach 1 Xyz Material from this card" — the Xyz activation cost. */
  detach?: number | 'ANY';
  payLifePoints?: number;
  /** Verbatim cost clauses that were recognised but not modelled. */
  other?: string[];
}

/**
 * A parsed activation condition — the PSCT text before the colon, or the
 * comma-delimited lead of a legacy (pre-2011) sentence.
 *
 * Never yields actions. This is what stops "If this card is sent to the GY:"
 * becoming an edge, while still recording the ruling-relevant properties of
 * the window it opens.
 */
export interface EffectTrigger {
  /** Konami's verbatim condition text. What the UI renders. */
  text: string;
  timing?: TriggerTiming;
  /**
   * True when this effect can miss the timing: an OPTIONAL trigger effect
   * whose condition opens with "When". See TriggerTiming.
   *
   * Never true for an effect that does not activate at all — a continuous
   * effect has no activation window to miss.
   */
  missesTiming: boolean;
  /** "(Quick Effect)" — Spell Speed 2, activatable during the opponent's turn. */
  quickEffect: boolean;
  /**
   * Windows the activation is barred from, verbatim: the near-universal
   * "(except during the Damage Step)" and its variants.
   */
  exclusions: string[];
}

/**
 * A printed override of how the card may be put onto the field. Not a
 * restriction on an effect and never an edge — a Nomi monster's "Must be
 * Special Summoned" line describes its own Summon, not something it searches.
 *
 * Kept verbatim and classified only coarsely: the graph needs to know "this
 * card cannot simply be Normal Summoned", not a full model of Summon legality.
 */
export const SummonConditionKind = {
  /**
   * "Must be Special Summoned by ..." — only ever by that method, so no other
   * card's effect can bring it back. A Nomi monster is NOT a legal target for
   * "Special Summon 1 monster from your GY".
   */
  NOMI: 'NOMI',
  /**
   * "Must FIRST be Special Summoned by ..." — once it has been Summoned
   * properly, other effects MAY revive it, so it IS a legal target for a
   * generic revival. The word "first" is the whole difference, and collapsing
   * it into NOMI would wrongly exclude 160 cards from every GY revival.
   */
  SEMI_NOMI: 'SEMI_NOMI',
  /** "You can Normal Summon this card without Tributing." */
  NO_TRIBUTE: 'NO_TRIBUTE',
  /** A Ritual Monster's "Requires ..." / "You can Ritual Summon this card with ..." */
  RITUAL: 'RITUAL',
  /** Any other printed condition on Summoning this card. */
  OTHER: 'OTHER',
} as const;
export type SummonConditionKind =
  (typeof SummonConditionKind)[keyof typeof SummonConditionKind];

export interface SummonCondition {
  kind: SummonConditionKind;
  text: string;
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
  /**
   * Printed overrides of how this card is Summoned. Present so these
   * sentences are classified rather than dumped in the review queue — they
   * are full of Summon verbs but describe no searchable action.
   */
  summonConditions: SummonCondition[];
}

/**
 * The game's classification of an effect.
 *
 * CONTINUOUS is the one that is read from an ABSENCE: a continuous effect
 * states no trigger and carries no colon or semicolon, because it never
 * activates — it simply applies while the card is face-up. The others all
 * activate and start a chain, and are told apart by what opens them.
 */
export const EffectType = {
  /** No trigger and no activation punctuation. Applies while face-up. */
  CONTINUOUS: 'CONTINUOUS',
  /** "When/If <event>:" — activates off something that happened. */
  TRIGGER: 'TRIGGER',
  /** "During your Main Phase:" — you choose to activate it. */
  IGNITION: 'IGNITION',
  /** "(Quick Effect):" — Spell Speed 2. */
  QUICK: 'QUICK',
  /** "FLIP:" — activates on being flipped face-up. */
  FLIP: 'FLIP',
  /**
   * Activates (it has the punctuation) but the opening word does not say which
   * of the above it is. Most Spell and Trap text reads this way, since those
   * cards activate by being played rather than off a condition.
   */
  ACTIVATED: 'ACTIVATED',
} as const;
export type EffectType = (typeof EffectType)[keyof typeof EffectType];

/** A stat a modifier can change. */
export const EffectStat = {
  ATK: 'ATK',
  DEF: 'DEF',
  ATK_AND_DEF: 'ATK_AND_DEF',
  LEVEL: 'LEVEL',
  RANK: 'RANK',
  PENDULUM_SCALE: 'PENDULUM_SCALE',
  ATTRIBUTE: 'ATTRIBUTE',
  TYPE: 'TYPE',
} as const;
export type EffectStat = (typeof EffectStat)[keyof typeof EffectStat];

/**
 * A continuous state an effect applies, as opposed to a discrete action it
 * performs on resolution.
 *
 * The distinction is the game's own: "gains 500 ATK" and "cannot be destroyed
 * by battle" describe how a card behaves for as long as the effect applies,
 * and there is no moment at which they "happen". Modelling them as actions
 * would mean inventing a source zone and a destination for things that move
 * no cards.
 */
export const ModifierKind = {
  /** gains / loses / becomes a stat. See `stat`, `mode`, `amount`. */
  STAT: 'STAT',
  CANNOT_ATTACK: 'CANNOT_ATTACK',
  MUST_ATTACK: 'MUST_ATTACK',
  CAN_ATTACK_DIRECTLY: 'CAN_ATTACK_DIRECTLY',
  CANNOT_CHANGE_POSITION: 'CANNOT_CHANGE_POSITION',
  /** "cannot be destroyed by battle and/or card effects" */
  INDESTRUCTIBLE: 'INDESTRUCTIBLE',
  UNTARGETABLE: 'UNTARGETABLE',
  /** "is unaffected by ..." */
  UNAFFECTED: 'UNAFFECTED',
  CANNOT_BE_MATERIAL: 'CANNOT_BE_MATERIAL',
  CANNOT_BE_TRIBUTED: 'CANNOT_BE_TRIBUTED',
  CANNOT_BE_BANISHED: 'CANNOT_BE_BANISHED',
  /** "is treated as a(n) X" — a type/archetype identity grant, not an alias. */
  TREATED_AS: 'TREATED_AS',
  /** "you cannot Special Summon monsters, except ..." */
  SUMMON_LOCK: 'SUMMON_LOCK',
  /** "you cannot activate cards or effects ..." */
  ACTIVATION_LOCK: 'ACTIVATION_LOCK',
  /** Recognised as a continuous state, but not one of the above. */
  OTHER: 'OTHER',
} as const;
export type ModifierKind = (typeof ModifierKind)[keyof typeof ModifierKind];

export interface EffectModifier {
  kind: ModifierKind;
  /** What the state applies to. Reuses the action target machinery. */
  target: EffectTarget;
  /** STAT only: which stat. */
  stat?: EffectStat;
  /** STAT only: gained, lost, or overwritten. */
  mode?: 'GAIN' | 'LOSE' | 'BECOMES';
  /**
   * STAT only: the magnitude. 'VARIABLE' when the text computes it ("gains 100
   * ATK for each ..."), which is honest rather than guessing a number.
   */
  amount?: number | 'VARIABLE';
  /**
   * Verbatim duration ("until the End Phase", "this turn"). Undefined means
   * the state holds for as long as the effect applies, which is the default
   * for a continuous effect.
   */
  duration?: string;
  /** The clause this came from. Same audit contract as EffectAction. */
  sourceText: string;
}

/** Which part of the card text an effect came from. */
export type EffectBlockKind = 'MAIN' | 'PENDULUM' | 'MONSTER' | 'BULLET';

export interface CardEffect {
  /** Stable within a card: `${blockIndex}.${sentenceIndex}`. */
  id: string;
  blockKind: EffectBlockKind;
  effectType: EffectType;
  trigger?: EffectTrigger;
  /**
   * Whether this effect starts a chain, read from the one punctuation clue
   * Konami guarantees: a colon or a semicolon marks an activated effect, and a
   * monster effect with neither is a continuous effect that cannot be chained
   * to (so Divine Wrath cannot negate it).
   *
   * `undefined` rather than `false` when the printing predates PSCT, because
   * the clue is then simply absent: Botanical Girl's "When this card is sent
   * from the field to the GY, you can add ..." is a genuine chainable trigger
   * effect that merely predates the colon. Reporting `false` there would be a
   * wrong fact rather than a missing one.
   */
  startsChain?: boolean;
  cost: EffectCost;
  /** Discrete things that happen on resolution. */
  actions: EffectAction[];
  /** Continuous states the effect applies. See EffectModifier. */
  modifiers: EffectModifier[];
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
  /**
   * The card's type. Required, because the chain clue is NOT universal:
   * Spells and Traps always start a chain when activated, whatever their
   * punctuation, and only MONSTER effects are read from the colon/semicolon.
   *
   * Without this, Terraforming's "Add 1 Field Spell from your Deck to your
   * hand." has no punctuation and would be classified a continuous effect.
   */
  cardType: CardType;
  /**
   * For Spells and Traps: the subtype, which says whether the card stays on
   * the field. A Continuous, Field or Equip card can print continuous effects
   * alongside its activation; a Normal or Quick-Play card activates, resolves
   * and leaves, so every line of it belongs to the activation.
   */
  spellTrapSubType?: SpellTrapSubType;
}

/** The verbs the search graph projects edges from. */
export const SEARCH_VERBS: readonly EffectVerb[] = [
  EffectVerb.ADD,
  EffectVerb.SPECIAL_SUMMON,
  EffectVerb.NORMAL_SUMMON,
  EffectVerb.SET,
];
