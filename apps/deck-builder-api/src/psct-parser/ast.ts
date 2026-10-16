/**
 * The canonical output of the PSCT parser.
 *
 * This module is the contract between the parser and every consumer of it. It
 * is framework-free on purpose: no Nest, no Prisma client, no decorators, so
 * the pipeline also runs under `tsx` in the batch scripts and under Jest on a
 * fixture corpus.
 *
 * Design rule, inherited from the implementation guide: store uncertainty
 * instead of hiding it. Every node keeps the span of the text it came from, and
 * anything the parser could not interpret becomes a `Diagnostic` rather than a
 * silent omission or a guess.
 */

/**
 * A region of the ORIGINAL card text.
 *
 * Offsets are always original-text offsets, never normalized-text offsets, so
 * a consumer can highlight directly on the printed card. `normalize.ts` owns
 * the mapping that makes that true; see `SpanMapping` there.
 */
export interface Span {
  start: number;
  end: number;
  text: string;
}

export const DiagnosticSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const;
export type DiagnosticSeverity =
  (typeof DiagnosticSeverity)[keyof typeof DiagnosticSeverity];

/**
 * Why a parse is less than fully trusted.
 *
 * These are a closed vocabulary rather than free text because they are the
 * review queue's sort key and the corpus metrics' histogram buckets. Adding a
 * code is cheap; renaming one invalidates stored metrics, so treat the strings
 * as persisted values.
 */
export const DiagnosticCode = {
  NORMALIZATION_CHANGED_TEXT: 'NORMALIZATION_CHANGED_TEXT',
  LEXER_UNKNOWN_TOKEN: 'LEXER_UNKNOWN_TOKEN',
  GRAMMAR_PARSE_ERROR: 'GRAMMAR_PARSE_ERROR',
  AMBIGUOUS_CONJUNCTION: 'AMBIGUOUS_CONJUNCTION',
  UNRESOLVED_REFERENCE: 'UNRESOLVED_REFERENCE',
  UNKNOWN_TARGET_REQUIREMENT: 'UNKNOWN_TARGET_REQUIREMENT',
  UNKNOWN_COST: 'UNKNOWN_COST',
  UNKNOWN_ACTION_VERB: 'UNKNOWN_ACTION_VERB',
  LEGACY_TEXT: 'LEGACY_TEXT',
  RULING_DEPENDENCY: 'RULING_DEPENDENCY',
  TEMPLATE_NOT_SUPPORTED: 'TEMPLATE_NOT_SUPPORTED',
  SCHEMA_VALIDATION_ERROR: 'SCHEMA_VALIDATION_ERROR',
} as const;
export type DiagnosticCode =
  (typeof DiagnosticCode)[keyof typeof DiagnosticCode];

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  span: Span | null;
}

/**
 * The game's classification of an effect.
 *
 * Deliberately NOT inferred from punctuation alone. A Spell or Trap starts a
 * Chain when activated whatever its text looks like, so Terraforming's
 * punctuation-free "Add 1 Field Spell from your Deck to your hand." is
 * `activated`, not `continuous`. `classify.ts` takes card metadata for exactly
 * this reason.
 *
 * `flip` is kept separate from `trigger` because "FLIP:" is its own activation
 * category in the rulebook, not a trigger condition that happens to mention
 * being flipped.
 */
export const EffectKind = {
  ACTIVATED: 'activated',
  TRIGGER: 'trigger',
  IGNITION: 'ignition',
  QUICK: 'quick',
  FLIP: 'flip',
  CONTINUOUS: 'continuous',
  STATIC: 'static',
  SUMMON_CONDITION: 'summon_condition',
  UNKNOWN: 'unknown',
} as const;
export type EffectKind = (typeof EffectKind)[keyof typeof EffectKind];

/**
 * The word a trigger condition opens with.
 *
 * Not cosmetic. This is one of the few places where Konami's wording maps onto
 * a hard rule: an OPTIONAL trigger effect opening with "When" may only activate
 * if its trigger was the last thing to happen, while an "If" effect has no such
 * restriction. See `ConditionNode.missesTiming`.
 */
export const TriggerTiming = {
  WHEN: 'when',
  IF: 'if',
  WHILE: 'while',
  DURING: 'during',
  EACH_TIME: 'each_time',
  AFTER: 'after',
} as const;
export type TriggerTiming = (typeof TriggerTiming)[keyof typeof TriggerTiming];

export const ConditionKind = {
  TIMING: 'timing',
  FREQUENCY: 'frequency',
  RESTRICTION: 'restriction',
  TRIGGER: 'trigger',
} as const;
export type ConditionKind = (typeof ConditionKind)[keyof typeof ConditionKind];

/**
 * Where in the sentence a condition was printed.
 *
 * This is NOT cosmetic. A LEADING condition (before the colon) gates
 * ACTIVATION — it is the event or window the effect activates off, and it is
 * what decides whether the effect can miss its timing. A TRAILING condition
 * (inside the resolution: "destroy 1 card on the field *if you control a
 * Dragon monster*") gates APPLICATION — the effect has already activated, and
 * this only says whether it does anything.
 *
 * Collapsing the two would be wrong in two specific ways: a trailing "when"
 * would wrongly report `missesTiming`, and a trailing "if" would wrongly make
 * an ignition or continuous effect classify as a TRIGGER.
 */
export type ConditionPosition = 'leading' | 'trailing';

export interface ConditionNode {
  kind: ConditionKind;
  position: ConditionPosition;
  text: string;
  /** Present for `trigger` and `timing` conditions that open with a keyword. */
  timing?: TriggerTiming;
  /**
   * True when this effect can miss the timing: an optional trigger effect whose
   * condition opens with "When". Mandatory effects never miss the timing
   * regardless of the word, so this depends on the enclosing effect's
   * `optional` flag and is filled in by the pipeline, not the visitor.
   */
  missesTiming: boolean;
  /** "(Quick Effect)" — Spell Speed 2, usable during the opponent's turn. */
  quickEffect: boolean;
  /** Verbatim windows the activation is barred from, e.g. the Damage Step. */
  exclusions: string[];
  span: Span;
}

/**
 * How an effect picks what it acts on.
 *
 * `legacy_select` is its own value rather than folded into either side because
 * pre-2011 "select" is genuinely undetermined: Konami's errata programme
 * rewrote it into either "target" or "choose" case by case, and an un-errata'd
 * card's printed text does not say which it became. Reporting the ambiguity is
 * honest; guessing would be wrong about half the time.
 */
export const SelectionMode = {
  TARGET: 'target',
  CHOOSE: 'choose',
  LEGACY_SELECT: 'legacy_select',
  NONE: 'none',
} as const;
export type SelectionMode = (typeof SelectionMode)[keyof typeof SelectionMode];

/** A quantity, or `any` for "any number of" / "as many as possible". */
export type Quantity = { min: number; max: number } | 'any';

export const Conjunction = {
  /** The first segment of a resolution. Depends on nothing. */
  NONE: 'none',
  THEN: 'then',
  AND_IF_YOU_DO: 'and_if_you_do',
  ALSO: 'also',
  AND: 'and',
  AFTER_THAT: 'after_that',
  /** ", but ..." — a qualification on what precedes, not a further action. */
  BUT: 'but',
} as const;
export type Conjunction = (typeof Conjunction)[keyof typeof Conjunction];

/**
 * Conjunctions whose segment does not happen at all if the preceding clause
 * failed.
 *
 * "then" and "and if you do" are stated as such by Konami. Bare "and" is
 * all-or-nothing — both halves are strictly required, so neither happens
 * unless both can. "after that" is not covered in the official text; it is
 * included because it is purely sequential and the same reasoning applies.
 * "also" is the odd one out: its segments are independent, so a failure
 * upstream does not stop it.
 */
export const DEPENDENT_CONJUNCTIONS: readonly Conjunction[] = [
  Conjunction.THEN,
  Conjunction.AND_IF_YOU_DO,
  Conjunction.AFTER_THAT,
  Conjunction.AND,
];

/**
 * A reference back to something named earlier in the text.
 *
 * Resolution happens in its own pass over the finished AST (`references.ts`),
 * because a pronoun's antecedent is frequently in a different clause from the
 * action that uses it: "target 1 monster in your GY; Special Summon it."
 */
export const ReferenceExpression = {
  THIS_CARD: 'this_card',
  IT: 'it',
  THAT_TARGET: 'that_target',
  THEM: 'them',
  BOTH: 'both',
  ALL: 'all',
  THOSE_CARDS: 'those_cards',
  UNKNOWN: 'unknown',
} as const;
export type ReferenceExpression =
  (typeof ReferenceExpression)[keyof typeof ReferenceExpression];

export interface ReferenceNode {
  kind: 'reference';
  expression: ReferenceExpression;
  /**
   * The id of the node this resolved to (a `TargetNode.id`), or null when the
   * antecedent could not be found. Null always comes with an
   * UNRESOLVED_REFERENCE diagnostic — never a silent guess.
   */
  resolvedTo: string | null;
  confidence: number;
  span: Span;
}

/**
 * A description of which cards a node can affect, expressed only in terms of
 * queryable Card columns so it can be turned into a Prisma `where`.
 *
 * This is why the AST does not settle for `filters: string[]`: a deck-building
 * tool has to be able to ask "what can fetch a Level 4 DARK Warrior", and that
 * question needs columns, not adjectives. `label` keeps Konami's verbatim noun
 * phrase for display, so the UI never has to reconstruct prose from columns.
 */
export interface CardFilter {
  cardType?: string[];
  summonType?: string[];
  spellTrapSubType?: string[];
  /** An EXACT archetype match, validated against the pool's vocabulary. */
  archetype?: string;
  /** The degraded fallback when a quoted token is not a known archetype. */
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
  /** Face-up / face-down, where the text says so. */
  position?: 'face-up' | 'face-down';
  /** From `except "X"` clauses. Never applied as a top-level `where.NOT`. */
  excludeNames?: string[];
}

/** Where cards come from, and whose. Zone and owner are orthogonal. */
export const Zone = {
  DECK: 'deck',
  HAND: 'hand',
  GY: 'gy',
  EXTRA_DECK: 'extra_deck',
  BANISHED: 'banished',
  FIELD: 'field',
  MONSTER_ZONE: 'monster_zone',
  ST_ZONE: 'st_zone',
  PENDULUM_ZONE: 'pendulum_zone',
  FIELD_ZONE: 'field_zone',
} as const;
export type Zone = (typeof Zone)[keyof typeof Zone];

export type ZoneOwner = 'self' | 'opponent' | 'either';

export interface ZoneRef {
  zone: Zone;
  owner: ZoneOwner;
}

/** Where cards end up. Face-up vs face-down is the Summon/Set distinction. */
export const Destination = {
  HAND: 'hand',
  FIELD_FACE_UP: 'field_face_up',
  FIELD_FACE_DOWN: 'field_face_down',
  GY: 'gy',
  BANISHED: 'banished',
  DECK: 'deck',
  EXTRA_DECK: 'extra_deck',
  PENDULUM_ZONE: 'pendulum_zone',
  REVEALED: 'revealed',
} as const;
export type Destination = (typeof Destination)[keyof typeof Destination];

/**
 * What a node acts on.
 *
 * A discriminated union rather than a nullable string, so that "could not be
 * determined" (`unresolved`) is a representable state that consumers must
 * handle, instead of an empty string that silently reads as "no constraint".
 */
export type TargetSubject =
  /** One or more specific cards, by exact name. */
  | { kind: 'named'; names: string[] }
  /** "this card" — the card bearing the effect. */
  | { kind: 'self' }
  /** A description rather than a name. `label` is Konami's verbatim phrase. */
  | { kind: 'criteria'; filter: CardFilter; label: string }
  /** A pronoun, pending or resolved by `references.ts`. */
  | { kind: 'reference'; reference: ReferenceNode }
  /** Recognised as a subject, but not pinned down. */
  | { kind: 'unresolved'; text: string };

export interface TargetNode {
  kind: 'target';
  /** Stable within a parse, so a `ReferenceNode` can point at it. */
  id: string;
  subject: TargetSubject;
  quantity: Quantity;
  /**
   * Whether this is a technical target. Targeting is a game action with its own
   * rules — it can be stopped by targeting protection and is locked in at
   * activation — so not every affected card is a target.
   */
  selection: SelectionMode;
  /** Empty when the text names no zone. Multiple for "from your hand or Deck". */
  sourceZones: ZoneRef[];
  span: Span;
}

export const CostKind = {
  DISCARD: 'discard',
  TRIBUTE: 'tribute',
  BANISH: 'banish',
  DETACH: 'detach',
  PAY_LIFE_POINTS: 'pay_life_points',
  SEND_TO_GY: 'send_to_gy',
  SHUFFLE_INTO_DECK: 'shuffle_into_deck',
  RETURN_TO_HAND: 'return_to_hand',
  REVEAL: 'reveal',
  /** Recognised as a cost, but not one of the above. Carries a diagnostic. */
  OTHER: 'other',
} as const;
export type CostKind = (typeof CostKind)[keyof typeof CostKind];

export interface CostNode {
  kind: 'cost';
  cost: CostKind;
  /**
   * How much is paid. `'any'` for "any number of", and `'variable'` when the
   * text computes it ("pay half your LP") — which is honest where a number
   * would be fiction and `null` would wrongly read as "no amount stated".
   */
  amount: number | 'any' | 'variable' | null;
  /** What is being paid, when the text describes it. */
  subject: TargetSubject | null;
  sourceZones: ZoneRef[];
  span: Span;
}

/** What the player does on resolution. */
export const ActionVerb = {
  ADD: 'add',
  SPECIAL_SUMMON: 'special_summon',
  NORMAL_SUMMON: 'normal_summon',
  SET: 'set',
  SEND: 'send',
  BANISH: 'banish',
  DRAW: 'draw',
  EXCAVATE: 'excavate',
  REVEAL: 'reveal',
  RETURN: 'return',
  DESTROY: 'destroy',
  NEGATE: 'negate',
  SHUFFLE: 'shuffle',
  PLACE: 'place',
  ATTACH: 'attach',
  EQUIP: 'equip',
  TRIBUTE: 'tribute',
  DISCARD: 'discard',
  INFLICT_DAMAGE: 'inflict_damage',
  /** "take 1000 damage" — the controller loses LP without being attacked. */
  TAKE_DAMAGE: 'take_damage',
  GAIN_LP: 'gain_lp',
  LOSE_LP: 'lose_lp',
  TAKE_CONTROL: 'take_control',
  CHANGE_POSITION: 'change_position',
  FLIP: 'flip',
  PLACE_COUNTER: 'place_counter',
  REMOVE_COUNTER: 'remove_counter',
  DETACH: 'detach',
  TOSS_COIN: 'toss_coin',
  ROLL_DICE: 'roll_dice',
  DECLARE: 'declare',
  END_BATTLE_PHASE: 'end_battle_phase',
  /** "activate 1 of these effects" — choosing a sub-effect, not a card. */
  ACTIVATE: 'activate',
  /** "apply this effect" — a pointer to an effect described elsewhere. */
  APPLY: 'apply',
  USE: 'use',
  SKIP: 'skip',
  WIN: 'win',
  /** The verb was lexed but is not in the vocabulary. Carries a diagnostic. */
  UNKNOWN: 'unknown',
} as const;
export type ActionVerb = (typeof ActionVerb)[keyof typeof ActionVerb];

/** The verbs a card-search graph projects edges from. */
export const SEARCH_VERBS: readonly ActionVerb[] = [
  ActionVerb.ADD,
  ActionVerb.SPECIAL_SUMMON,
  ActionVerb.NORMAL_SUMMON,
  ActionVerb.SET,
];

export interface ActionNode {
  kind: 'action';
  verb: ActionVerb;
  /** What the verb acts on. Null when the text states no object. */
  object: TargetNode | null;
  destination?: Destination;
  /** The magnitude, for verbs that carry one (damage, LP, draw, counters). */
  amount: number | 'variable' | null;
  /** Verbatim trailing qualifiers that are not modelled, e.g. a duration. */
  modifiers: string[];
  /** The conjunction that introduced this action's segment. */
  conjunction: Conjunction;
  /**
   * True when this action does not happen at all if the preceding segment
   * failed. Derived from `conjunction` via DEPENDENT_CONJUNCTIONS.
   */
  dependsOnPrevious: boolean;
  /**
   * True only when the verb is known and the object is fully pinned down.
   * Consumers that draw graph edges must filter on this: a declined action
   * costs a feature, a wrong one costs trust in the dataset.
   */
  resolved: boolean;
  span: Span;
}

/**
 * A continuous state an effect applies, as opposed to a discrete action.
 *
 * The distinction is the game's own: "gains 500 ATK" and "cannot be destroyed
 * by battle" describe how a card behaves for as long as the effect applies, and
 * there is no moment at which they happen. Forcing them through `ActionNode`
 * would mean inventing a source zone and a destination for something that moves
 * no cards.
 */
export const ModifierKind = {
  STAT: 'stat',
  CANNOT_ATTACK: 'cannot_attack',
  MUST_ATTACK: 'must_attack',
  CAN_ATTACK_DIRECTLY: 'can_attack_directly',
  CANNOT_CHANGE_POSITION: 'cannot_change_position',
  INDESTRUCTIBLE: 'indestructible',
  UNTARGETABLE: 'untargetable',
  UNAFFECTED: 'unaffected',
  CANNOT_BE_MATERIAL: 'cannot_be_material',
  CANNOT_BE_TRIBUTED: 'cannot_be_tributed',
  CANNOT_BE_BANISHED: 'cannot_be_banished',
  TREATED_AS: 'treated_as',
  SUMMON_LOCK: 'summon_lock',
  ACTIVATION_LOCK: 'activation_lock',
  OTHER: 'other',
} as const;
export type ModifierKind = (typeof ModifierKind)[keyof typeof ModifierKind];

export const Stat = {
  ATK: 'atk',
  DEF: 'def',
  ATK_AND_DEF: 'atk_and_def',
  LEVEL: 'level',
  RANK: 'rank',
  PENDULUM_SCALE: 'pendulum_scale',
  ATTRIBUTE: 'attribute',
  TYPE: 'type',
} as const;
export type Stat = (typeof Stat)[keyof typeof Stat];

export interface ModifierNode {
  kind: 'modifier';
  modifier: ModifierKind;
  /** What the state applies to. Reuses the target machinery. */
  object: TargetNode | null;
  stat?: Stat;
  /**
   * `becomes` is a ruling distinction, not a synonym for `gain`/`lose`: a
   * monster whose ATK *becomes* 0 has lost its original value, while one that
   * *loses* ATK has not.
   */
  mode?: 'gain' | 'lose' | 'becomes';
  /** 'variable' when the text computes it ("gains 100 ATK for each ..."). */
  amount?: number | 'variable';
  /** Verbatim duration ("until the End Phase"). Never modelled further. */
  duration?: string;
  span: Span;
}

/** A conditional: `then` happens only if `condition` succeeded. */
export interface ConditionalNode {
  kind: 'conditional';
  condition: EffectNode;
  then: EffectNode;
  span: Span;
}

/** Ordered, dependent. If an earlier child fails, later children stop. */
export interface SequenceNode {
  kind: 'sequence';
  simultaneous: false;
  children: EffectNode[];
  span: Span;
}

/** Simultaneous. Children do not stop each other from happening. */
export interface ParallelNode {
  kind: 'parallel';
  simultaneous: true;
  children: EffectNode[];
  span: Span;
}

export type EffectNode =
  | ActionNode
  | ModifierNode
  | ConditionalNode
  | SequenceNode
  | ParallelNode;

/** Which part of the printed card text an effect came from. */
export const BlockKind = {
  MAIN: 'main',
  /** The lower half of a Pendulum card, below the scale rule. */
  PENDULUM: 'pendulum',
  /** The monster-effect half of a Pendulum card. */
  MONSTER: 'monster',
  /** One item of a bulleted list, e.g. a Link monster's "●" effects. */
  BULLET: 'bullet',
} as const;
export type BlockKind = (typeof BlockKind)[keyof typeof BlockKind];

/**
 * A printed override of how the card may be put onto the field.
 *
 * Classified rather than performed: a Nomi monster's "Must be Special
 * Summoned" line is full of Summon verbs but describes no searchable action.
 * `semi_nomi` is kept apart from `nomi` because the word "first" is the whole
 * difference — once a semi-Nomi monster has been Summoned properly, other
 * effects may revive it, so it IS a legal object for a generic GY revival.
 */
export const SummonConditionKind = {
  NOMI: 'nomi',
  SEMI_NOMI: 'semi_nomi',
  NO_TRIBUTE: 'no_tribute',
  RITUAL: 'ritual',
  OTHER: 'other',
} as const;
export type SummonConditionKind =
  (typeof SummonConditionKind)[keyof typeof SummonConditionKind];

export interface SummonConditionNode {
  kind: SummonConditionKind;
  text: string;
  span: Span;
}

export interface Restrictions {
  /**
   * Name-locked once per turn. Limits the whole play rather than this copy, so
   * it is a different fact from `softOncePerTurn`.
   */
  hardOncePerTurn?: {
    scope: 'effect' | 'activation' | 'summon';
    name?: string;
  };
  /** Bare "Once per turn" — limited per copy, not by name. */
  softOncePerTurn?: boolean;
  /** From `except "X"`. Also mirrored onto criteria filters. */
  exceptNames: string[];
  /** Verbatim display-only clauses: summon locks, phase locks, archetype locks. */
  labels: string[];
  summonConditions: SummonConditionNode[];
}

/**
 * One parsed effect. A card has several of these: Pendulum cards print two
 * halves, and Link monsters print bulleted lists.
 */
export interface ParsedEffect {
  /** Stable within a card: `${blockIndex}.${sentenceIndex}`. */
  id: string;
  blockKind: BlockKind;
  effectKind: EffectKind;
  condition: ConditionNode[];
  /** Costs and targets declared before the resolution's semicolon. */
  activation: (CostNode | TargetNode)[];
  resolution: EffectNode | null;
  restrictions: Restrictions;
  /** "You can ..." — optional rather than mandatory. Drives missesTiming. */
  optional: boolean;
  /**
   * Whether this effect starts a Chain.
   *
   * `undefined` rather than `false` when the printing predates PSCT, because
   * the punctuation clue is then simply absent: Botanical Girl's "When this
   * card is sent from the field to the GY, you can add ..." is a genuine
   * chainable trigger effect that merely predates the colon. Reporting `false`
   * there would be a wrong fact rather than a missing one.
   */
  startsChain?: boolean;
  sourceText: string;
  span: Span;
  diagnostics: Diagnostic[];
  confidence: number;
}

/**
 * Which text convention a card's effect text follows.
 *
 * This is a property of the CARD, not of the parser, and it is what lets a
 * caller route work: Problem-Solving Card Text is a constrained grammar that a
 * rule-based parser handles well, while pre-2011 text predates those
 * conventions and is the natural target for an LLM pass instead.
 *
 * Kept separate from `origin` (which parser produced the result) and from
 * `parserVersion` (which revision of it). All three are different questions,
 * and collapsing them would make "re-parse the legacy cards with the LLM" an
 * unanswerable query.
 */
export const EffectTextFormat = {
  /** Modern Problem-Solving Card Text: colon/semicolon clause structure. */
  PSCT: 'psct',
  /**
   * Pre-PSCT wording. Detected from evidence the parser actually hit — a
   * condition recovered from a comma rather than a colon, or an un-errata'd
   * "select" whose targeting status the text does not state — never assumed
   * from the card's age, which this package does not know.
   */
  LEGACY: 'legacy',
} as const;
export type EffectTextFormat =
  (typeof EffectTextFormat)[keyof typeof EffectTextFormat];

/** The whole-card parse result, as persisted. */
export interface ParsedCard {
  cardId: string;
  cardName: string;
  sourceText: string;
  normalizedText: string;
  effects: ParsedEffect[];
  diagnostics: Diagnostic[];
  /** The minimum of the per-effect confidences; 1 when there are no effects. */
  confidence: number;
  parserVersion: number;
  parsedAt: string;
  /**
   * The text convention this card follows. See `EffectTextFormat`.
   *
   * Stored on every parse so a consumer can select the cards a different
   * parser should handle without re-deriving it from diagnostics.
   */
  format: EffectTextFormat;
  /**
   * How this row was produced. The batch script must never overwrite a row
   * whose origin is not `rules` unless forced — that is what stops a future
   * LLM or manual pass from being clobbered by a re-parse.
   */
  origin: 'rules' | 'llm' | 'manual';
}

/**
 * Bump whenever a change makes previously persisted parses wrong. Consumers
 * compare it and re-parse live on mismatch, so a bump is always safe; it just
 * costs a live parse until the batch script runs again.
 */
export const PARSER_VERSION = 3;

/**
 * Vocabulary the parser needs but cannot know statically. Injected rather than
 * queried so the pipeline stays pure and specs can run on a small fixture set.
 */
export interface ParserContext {
  /** `SELECT DISTINCT archetype` — ~650 values in the current pool. */
  archetypes: ReadonlySet<string>;
  /** `SELECT DISTINCT race` for monsters — ~27 values. */
  races: ReadonlySet<string>;
  cardId: string;
  cardName: string;
  /**
   * Required, because the chain clue is not universal: Spells and Traps always
   * start a Chain when activated whatever their punctuation, and only monster
   * effects are read from the colon/semicolon.
   */
  cardType: 'MONSTER' | 'SPELL' | 'TRAP';
  /**
   * For Spells and Traps: whether the card stays on the field. A Continuous,
   * Field or Equip card can print continuous effects alongside its activation;
   * a Normal or Quick-Play card activates, resolves and leaves.
   */
  spellTrapSubType?: string;
}
