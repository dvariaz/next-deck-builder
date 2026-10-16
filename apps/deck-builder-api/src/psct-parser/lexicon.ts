/**
 * Stage 3a — the PSCT lexicon, as data.
 *
 * Every phrase the lexer recognises lives in this table rather than in parser
 * logic. That is a deliberate constraint: PSCT's vocabulary grows with every
 * set, and adding "Link Summon" or a new counter name should be a one-line data
 * change that cannot break the grammar.
 *
 * `semanticHint` is what the visitor reads to turn an `image` into an enum
 * value, so the grammar never has to branch on specific words. A token's
 * `tokenType` says where it may appear; its hint says what it means.
 *
 * ORDERING IS LOAD-BEARING. Longer phrases must be matched before shorter ones
 * that prefix them, or "and if you do" lexes as "and" + "if" + "you do" and the
 * dependency between the two halves is lost. `compileLexicon` sorts by phrase
 * length for exactly this reason, so entries can be listed in whatever order
 * reads best here.
 */

/**
 * The token categories the grammar is written against.
 *
 * Only kinds BUILT FROM THE LEXICON belong here. Punctuation, quoted names,
 * parentheticals and block headers are created directly in `lexer.ts` with
 * their own patterns, so they have no lexicon entries and no kind.
 */
export const TokenKind = {
  CONDITION_MARKER: 'ConditionMarker',
  FREQUENCY: 'Frequency',
  YOU_CAN: 'YouCan',
  TARGET_VERB: 'TargetVerb',
  VERB: 'Verb',
  CONJUNCTION: 'Conjunction',
  REFERENCE: 'Reference',
  ZONE: 'Zone',
  OWNER: 'Owner',
  ATTRIBUTE: 'Attribute',
  STAT: 'Stat',
  MODIFIER: 'Modifier',
  POSITION: 'Position',
  QUANTIFIER: 'Quantifier',
  COMPARATOR: 'Comparator',
  DISJUNCTION: 'Disjunction',
  PREPOSITION: 'Preposition',
  EXCEPT: 'Except',
} as const;
export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind];

export interface LexiconEntry {
  /** The literal phrase. Internal runs of whitespace match flexibly. */
  phrase: string;
  tokenType: TokenKind;
  /** What the phrase means, read by the visitor. */
  semanticHint?: string;
}

/**
 * Condition markers.
 *
 * The "When" / "If" distinction is the single most ruling-relevant word pair in
 * the game: an optional trigger effect opening with "When" can miss the timing,
 * one opening with "If" cannot. See `ConditionNode.missesTiming`.
 */
const CONDITIONS: LexiconEntry[] = [
  {
    phrase: 'When',
    tokenType: TokenKind.CONDITION_MARKER,
    semanticHint: 'when',
  },
  { phrase: 'If', tokenType: TokenKind.CONDITION_MARKER, semanticHint: 'if' },
  {
    phrase: 'While',
    tokenType: TokenKind.CONDITION_MARKER,
    semanticHint: 'while',
  },
  {
    phrase: 'During',
    tokenType: TokenKind.CONDITION_MARKER,
    semanticHint: 'during',
  },
  {
    phrase: 'Each time',
    tokenType: TokenKind.CONDITION_MARKER,
    semanticHint: 'each_time',
  },
  {
    phrase: 'After',
    tokenType: TokenKind.CONDITION_MARKER,
    semanticHint: 'after',
  },
];

/**
 * Frequency restrictions.
 *
 * The name-locked forms ("You can only use this effect of ... once per turn")
 * are matched in `restrictions.ts` against the whole sentence, because they
 * carry a card name and a scope. These are the bare adverbial forms.
 */
const FREQUENCIES: LexiconEntry[] = [
  {
    phrase: 'Once per turn',
    tokenType: TokenKind.FREQUENCY,
    semanticHint: 'once_per_turn',
  },
  {
    phrase: 'Once per Duel',
    tokenType: TokenKind.FREQUENCY,
    semanticHint: 'once_per_duel',
  },
  {
    phrase: 'Twice per turn',
    tokenType: TokenKind.FREQUENCY,
    semanticHint: 'twice_per_turn',
  },
];

/** Optionality. "You can" is what makes an effect optional, and thus what
 * makes a "When" trigger able to miss its timing. */
const OPTIONALITY: LexiconEntry[] = [
  {
    phrase: 'You can also',
    tokenType: TokenKind.YOU_CAN,
    semanticHint: 'you_can_also',
  },
  { phrase: 'You can', tokenType: TokenKind.YOU_CAN, semanticHint: 'you_can' },
  {
    phrase: 'you must',
    tokenType: TokenKind.YOU_CAN,
    semanticHint: 'you_must',
  },
];

/**
 * Selection verbs.
 *
 * Kept as their own token type because targeting is a technical game action,
 * not a synonym for "affect": a targeting effect can be stopped by targeting
 * protection and locks its choice in at activation. "Select" is pre-errata and
 * genuinely undetermined — see `SelectionMode.LEGACY_SELECT`.
 */
const SELECTION: LexiconEntry[] = [
  {
    phrase: 'Target',
    tokenType: TokenKind.TARGET_VERB,
    semanticHint: 'target',
  },
  {
    phrase: 'Choose',
    tokenType: TokenKind.TARGET_VERB,
    semanticHint: 'choose',
  },
  {
    phrase: 'Select',
    tokenType: TokenKind.TARGET_VERB,
    semanticHint: 'legacy_select',
  },
  // "Your opponent chooses 1 random card from your hand" — a selection made by
  // the opponent, but a selection all the same.
  {
    phrase: 'chooses',
    tokenType: TokenKind.TARGET_VERB,
    semanticHint: 'choose',
  },
  {
    phrase: 'selects',
    tokenType: TokenKind.TARGET_VERB,
    semanticHint: 'legacy_select',
  },
  {
    phrase: 'targets',
    tokenType: TokenKind.TARGET_VERB,
    semanticHint: 'target',
  },
];

/**
 * Action and cost verbs.
 *
 * One token type covers both: whether "discard" is a cost or a resolution
 * action is decided by which side of the semicolon it falls on, which the
 * structural split in `structure.ts` already establishes. Encoding it in the
 * token would mean lexing the same word two ways and guessing.
 *
 * Multi-word verbs come first in spirit; `compileLexicon` enforces it.
 */
const VERBS: LexiconEntry[] = [
  {
    phrase: 'Special Summon',
    tokenType: TokenKind.VERB,
    semanticHint: 'special_summon',
  },
  {
    phrase: 'Normal Summon',
    tokenType: TokenKind.VERB,
    semanticHint: 'normal_summon',
  },
  {
    phrase: 'Ritual Summon',
    tokenType: TokenKind.VERB,
    semanticHint: 'special_summon',
  },
  {
    phrase: 'Fusion Summon',
    tokenType: TokenKind.VERB,
    semanticHint: 'special_summon',
  },
  {
    phrase: 'Synchro Summon',
    tokenType: TokenKind.VERB,
    semanticHint: 'special_summon',
  },
  {
    phrase: 'Xyz Summon',
    tokenType: TokenKind.VERB,
    semanticHint: 'special_summon',
  },
  {
    phrase: 'Link Summon',
    tokenType: TokenKind.VERB,
    semanticHint: 'special_summon',
  },
  {
    phrase: 'end the Battle Phase',
    tokenType: TokenKind.VERB,
    semanticHint: 'end_battle_phase',
  },
  {
    phrase: 'take control',
    tokenType: TokenKind.VERB,
    semanticHint: 'take_control',
  },
  {
    phrase: 'inflict',
    tokenType: TokenKind.VERB,
    semanticHint: 'inflict_damage',
  },
  { phrase: 'place', tokenType: TokenKind.VERB, semanticHint: 'place' },
  { phrase: 'excavate', tokenType: TokenKind.VERB, semanticHint: 'excavate' },
  { phrase: 'detach', tokenType: TokenKind.VERB, semanticHint: 'detach' },
  { phrase: 'destroy', tokenType: TokenKind.VERB, semanticHint: 'destroy' },
  { phrase: 'negate', tokenType: TokenKind.VERB, semanticHint: 'negate' },
  { phrase: 'shuffle', tokenType: TokenKind.VERB, semanticHint: 'shuffle' },
  { phrase: 'discard', tokenType: TokenKind.VERB, semanticHint: 'discard' },
  { phrase: 'tribute', tokenType: TokenKind.VERB, semanticHint: 'tribute' },
  { phrase: 'banish', tokenType: TokenKind.VERB, semanticHint: 'banish' },
  { phrase: 'reveal', tokenType: TokenKind.VERB, semanticHint: 'reveal' },
  { phrase: 'return', tokenType: TokenKind.VERB, semanticHint: 'return' },
  { phrase: 'attach', tokenType: TokenKind.VERB, semanticHint: 'attach' },
  { phrase: 'equip', tokenType: TokenKind.VERB, semanticHint: 'equip' },
  { phrase: 'draw', tokenType: TokenKind.VERB, semanticHint: 'draw' },
  { phrase: 'send', tokenType: TokenKind.VERB, semanticHint: 'send' },
  { phrase: 'add', tokenType: TokenKind.VERB, semanticHint: 'add' },
  { phrase: 'pay', tokenType: TokenKind.VERB, semanticHint: 'pay_life_points' },
  { phrase: 'flip', tokenType: TokenKind.VERB, semanticHint: 'flip' },
  // "change that target to face-down Defense Position" — without this, "change"
  // lexes as a plain word and the clause parses as a modifier that never
  // arrives.
  {
    phrase: 'change',
    tokenType: TokenKind.VERB,
    semanticHint: 'change_position',
  },
  { phrase: 'Set', tokenType: TokenKind.VERB, semanticHint: 'set' },
  { phrase: 'take', tokenType: TokenKind.VERB, semanticHint: 'take_damage' },
  { phrase: 'toss', tokenType: TokenKind.VERB, semanticHint: 'toss_coin' },
  { phrase: 'roll', tokenType: TokenKind.VERB, semanticHint: 'roll_dice' },
  { phrase: 'declare', tokenType: TokenKind.VERB, semanticHint: 'declare' },
  // The following were added from a coverage run over the live pool rather than
  // from intuition: each was the single most common cause of an unparsed
  // resolution at the time. See `yarn psct:metrics`, whose failure-shape
  // histogram names the missing rule directly.
  { phrase: 'activate', tokenType: TokenKind.VERB, semanticHint: 'activate' },
  { phrase: 'apply', tokenType: TokenKind.VERB, semanticHint: 'apply' },
  { phrase: 'put', tokenType: TokenKind.VERB, semanticHint: 'place' },
  { phrase: 'look', tokenType: TokenKind.VERB, semanticHint: 'excavate' },
  {
    phrase: 'distribute',
    tokenType: TokenKind.VERB,
    semanticHint: 'place_counter',
  },
  {
    phrase: 'switch',
    tokenType: TokenKind.VERB,
    semanticHint: 'change_position',
  },
  { phrase: 'use', tokenType: TokenKind.VERB, semanticHint: 'use' },
  { phrase: 'skip', tokenType: TokenKind.VERB, semanticHint: 'skip' },
  { phrase: 'win', tokenType: TokenKind.VERB, semanticHint: 'win' },
  // Pre-PSCT LP wording. "increase your Life Points by 700 points" is the old
  // phrasing of what modern text prints as "gain 700 LP".
  { phrase: 'increase', tokenType: TokenKind.VERB, semanticHint: 'gain_lp' },
  { phrase: 'decrease', tokenType: TokenKind.VERB, semanticHint: 'lose_lp' },
  { phrase: 'give', tokenType: TokenKind.VERB, semanticHint: 'take_control' },
];

/**
 * Conjunctions — semantic operators, not decorative connectors.
 *
 * "and if you do" MUST be matched before "and", and "after that" before
 * "after", or the dependency semantics are silently lost. See
 * `DEPENDENT_CONJUNCTIONS`.
 */
const CONJUNCTIONS: LexiconEntry[] = [
  {
    phrase: 'and if you do',
    tokenType: TokenKind.CONJUNCTION,
    semanticHint: 'and_if_you_do',
  },
  {
    phrase: 'and if you do not',
    tokenType: TokenKind.CONJUNCTION,
    semanticHint: 'and_if_you_do_not',
  },
  {
    phrase: 'after that',
    tokenType: TokenKind.CONJUNCTION,
    semanticHint: 'after_that',
  },
  { phrase: 'then', tokenType: TokenKind.CONJUNCTION, semanticHint: 'then' },
  { phrase: 'also', tokenType: TokenKind.CONJUNCTION, semanticHint: 'also' },
  { phrase: 'but', tokenType: TokenKind.CONJUNCTION, semanticHint: 'but' },
  { phrase: 'and', tokenType: TokenKind.CONJUNCTION, semanticHint: 'and' },
];

/**
 * "or", as its own kind and as noun-phrase material rather than a clause
 * separator.
 *
 * PSCT never uses "or" to join two actions — that is what "then", "also" and
 * "and if you do" are for. It joins alternatives INSIDE one phrase: "from your
 * hand or Deck", "destroy 1 Spell or Trap". Treating it as a conjunction would
 * split "from your hand or Deck" into an action plus a fragment starting at
 * "Deck", which then fails to parse at all.
 */
const DISJUNCTION: LexiconEntry[] = [
  { phrase: 'or', tokenType: TokenKind.DISJUNCTION, semanticHint: 'or' },
];

/**
 * References. Resolved in a later pass over the finished AST, because the
 * antecedent is usually in a different clause from the action that uses it.
 */
const REFERENCES: LexiconEntry[] = [
  // POSSESSIVE forms first. Without them "this card" matched inside "This
  // card's ATK becomes 2400" and left a dangling "'s", breaking the clause —
  // the same failure the owner possessives had, one level down. The possessive
  // still refers to the same entity, so the hint is unchanged: what follows it
  // ("ATK", "name") is read as the noun phrase.
  {
    phrase: "this card's",
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'this_card',
  },
  {
    phrase: "this monster's",
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'this_card',
  },
  {
    phrase: "that card's",
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'it',
  },
  {
    phrase: "that monster's",
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'it',
  },
  {
    phrase: 'this card',
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'this_card',
  },
  {
    phrase: 'this monster',
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'this_card',
  },
  {
    phrase: 'that target',
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'that_target',
  },
  {
    phrase: 'those cards',
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'those_cards',
  },
  {
    phrase: 'those monsters',
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'those_cards',
  },
  { phrase: 'that card', tokenType: TokenKind.REFERENCE, semanticHint: 'it' },
  {
    phrase: 'that monster',
    tokenType: TokenKind.REFERENCE,
    semanticHint: 'it',
  },
  { phrase: 'both', tokenType: TokenKind.REFERENCE, semanticHint: 'both' },
  { phrase: 'them', tokenType: TokenKind.REFERENCE, semanticHint: 'them' },
  { phrase: 'it', tokenType: TokenKind.REFERENCE, semanticHint: 'it' },
];

/**
 * Zones.
 *
 * "GY" and "Graveyard" are the same zone printed differently across eras, so
 * they share a hint. Owner is lexed separately because every zone has a
 * your/opponent's/either variant and doubling the enum would be 30 entries.
 */
const ZONES: LexiconEntry[] = [
  {
    phrase: 'Extra Deck',
    tokenType: TokenKind.ZONE,
    semanticHint: 'extra_deck',
  },
  { phrase: 'Main Deck', tokenType: TokenKind.ZONE, semanticHint: 'deck' },
  {
    phrase: 'Pendulum Zone',
    tokenType: TokenKind.ZONE,
    semanticHint: 'pendulum_zone',
  },
  {
    phrase: 'Field Zone',
    tokenType: TokenKind.ZONE,
    semanticHint: 'field_zone',
  },
  {
    phrase: 'Monster Zone',
    tokenType: TokenKind.ZONE,
    semanticHint: 'monster_zone',
  },
  {
    phrase: 'Spell & Trap Zone',
    tokenType: TokenKind.ZONE,
    semanticHint: 'st_zone',
  },
  {
    phrase: 'Spell and Trap Zone',
    tokenType: TokenKind.ZONE,
    semanticHint: 'st_zone',
  },
  { phrase: 'Graveyard', tokenType: TokenKind.ZONE, semanticHint: 'gy' },
  { phrase: 'GY', tokenType: TokenKind.ZONE, semanticHint: 'gy' },
  { phrase: 'Deck', tokenType: TokenKind.ZONE, semanticHint: 'deck' },
  { phrase: 'hand', tokenType: TokenKind.ZONE, semanticHint: 'hand' },
  { phrase: 'field', tokenType: TokenKind.ZONE, semanticHint: 'field' },
];

const OWNERS: LexiconEntry[] = [
  {
    phrase: "your opponent's",
    tokenType: TokenKind.OWNER,
    semanticHint: 'opponent',
  },
  {
    phrase: 'your opponent controls',
    tokenType: TokenKind.OWNER,
    semanticHint: 'opponent',
  },
  {
    phrase: 'your opponent',
    tokenType: TokenKind.OWNER,
    semanticHint: 'opponent',
  },
  { phrase: 'you control', tokenType: TokenKind.OWNER, semanticHint: 'self' },
  // The POSSESSIVE forms must be listed, not just the bare ones. "your
  // opponent's" was already here, but "either player" alone matched inside
  // "either player's turn" and left a dangling "'s" as two junk tokens, which
  // then broke the clause — ~280 occurrences in the pool.
  {
    phrase: "either player's",
    tokenType: TokenKind.OWNER,
    semanticHint: 'either',
  },
  {
    phrase: "each player's",
    tokenType: TokenKind.OWNER,
    semanticHint: 'either',
  },
  {
    phrase: 'either player',
    tokenType: TokenKind.OWNER,
    semanticHint: 'either',
  },
  {
    phrase: 'each player',
    tokenType: TokenKind.OWNER,
    semanticHint: 'either',
  },
  { phrase: 'your', tokenType: TokenKind.OWNER, semanticHint: 'self' },
];

const ATTRIBUTES: LexiconEntry[] = [
  'DARK',
  'LIGHT',
  'EARTH',
  'WATER',
  'FIRE',
  'WIND',
  'DIVINE',
].map((phrase) => ({
  phrase,
  tokenType: TokenKind.ATTRIBUTE,
  semanticHint: phrase,
}));

const STATS: LexiconEntry[] = [
  {
    phrase: 'Pendulum Scale',
    tokenType: TokenKind.STAT,
    semanticHint: 'pendulum_scale',
  },
  { phrase: 'original ATK', tokenType: TokenKind.STAT, semanticHint: 'atk' },
  {
    phrase: 'ATK and DEF',
    tokenType: TokenKind.STAT,
    semanticHint: 'atk_and_def',
  },
  { phrase: 'ATK', tokenType: TokenKind.STAT, semanticHint: 'atk' },
  { phrase: 'DEF', tokenType: TokenKind.STAT, semanticHint: 'def' },
  { phrase: 'Level', tokenType: TokenKind.STAT, semanticHint: 'level' },
  { phrase: 'Rank', tokenType: TokenKind.STAT, semanticHint: 'rank' },
  { phrase: 'Link Rating', tokenType: TokenKind.STAT, semanticHint: 'link' },
  { phrase: 'Attribute', tokenType: TokenKind.STAT, semanticHint: 'attribute' },
  { phrase: 'Type', tokenType: TokenKind.STAT, semanticHint: 'type' },
  { phrase: 'LP', tokenType: TokenKind.STAT, semanticHint: 'lp' },
  { phrase: 'Life Points', tokenType: TokenKind.STAT, semanticHint: 'lp' },
];

/**
 * Continuous-state vocabulary.
 *
 * "becomes" is kept distinct from "gains"/"loses" because it is a ruling
 * distinction, not a synonym: a monster whose ATK *becomes* 0 has lost its
 * original value, one that *loses* ATK has not.
 */
const MODIFIERS: LexiconEntry[] = [
  {
    phrase: 'cannot be destroyed by battle',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'indestructible_battle',
  },
  {
    phrase: 'cannot be destroyed by card effects',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'indestructible_effect',
  },
  {
    phrase: 'cannot be destroyed',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'indestructible',
  },
  {
    phrase: 'cannot be targeted',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'untargetable',
  },
  {
    phrase: 'cannot be Tributed',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'cannot_be_tributed',
  },
  {
    phrase: 'cannot be banished',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'cannot_be_banished',
  },
  {
    phrase: 'cannot change its battle position',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'cannot_change_position',
  },
  {
    phrase: 'cannot attack directly',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'cannot_attack_directly',
  },
  // The standard direct-attack wording names the opponent in the MIDDLE of the
  // phrase ("can attack your opponent directly"), so the shorter form on its
  // own never matches real card text.
  {
    phrase: 'can attack your opponent directly',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'can_attack_directly',
  },
  {
    phrase: 'cannot attack your opponent directly',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'cannot_attack_directly',
  },
  {
    phrase: 'can attack directly',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'can_attack_directly',
  },
  {
    phrase: 'cannot attack',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'cannot_attack',
  },
  {
    phrase: 'must attack',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'must_attack',
  },
  {
    phrase: 'is unaffected by',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'unaffected',
  },
  {
    phrase: 'are unaffected by',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'unaffected',
  },
  {
    phrase: 'is treated as',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'treated_as',
  },
  {
    phrase: 'are treated as',
    tokenType: TokenKind.MODIFIER,
    semanticHint: 'treated_as',
  },
  { phrase: 'becomes', tokenType: TokenKind.MODIFIER, semanticHint: 'becomes' },
  { phrase: 'become', tokenType: TokenKind.MODIFIER, semanticHint: 'becomes' },
  // All four inflection forms are MODIFIER, including the plural verb forms
  // "gain"/"lose". The word alone does not say whether the clause is a
  // continuous stat change ("monsters you control gain 300 ATK") or a discrete
  // LP action ("you gain 500 LP") — only the stat that follows does. That is a
  // semantic decision, so the visitor makes it; lexing the same word two ways
  // would mean guessing in the lexer, where there is no context to guess from.
  { phrase: 'gains', tokenType: TokenKind.MODIFIER, semanticHint: 'gain' },
  { phrase: 'loses', tokenType: TokenKind.MODIFIER, semanticHint: 'lose' },
  { phrase: 'gain', tokenType: TokenKind.MODIFIER, semanticHint: 'gain' },
  { phrase: 'lose', tokenType: TokenKind.MODIFIER, semanticHint: 'lose' },
  { phrase: 'cannot', tokenType: TokenKind.MODIFIER, semanticHint: 'cannot' },
];

const POSITIONS: LexiconEntry[] = [
  { phrase: 'face-up', tokenType: TokenKind.POSITION, semanticHint: 'face-up' },
  {
    phrase: 'face-down',
    tokenType: TokenKind.POSITION,
    semanticHint: 'face-down',
  },
  {
    phrase: 'Attack Position',
    tokenType: TokenKind.POSITION,
    semanticHint: 'attack',
  },
  {
    phrase: 'Defense Position',
    tokenType: TokenKind.POSITION,
    semanticHint: 'defense',
  },
];

/**
 * Quantifiers. "any number of" and "as many as possible" both mean the
 * quantity is not a fixed number, which the AST records as `'any'` rather than
 * inventing a bound.
 */
const QUANTIFIERS: LexiconEntry[] = [
  {
    phrase: 'any number of',
    tokenType: TokenKind.QUANTIFIER,
    semanticHint: 'any',
  },
  {
    phrase: 'as many as possible',
    tokenType: TokenKind.QUANTIFIER,
    semanticHint: 'any',
  },
  { phrase: 'as many', tokenType: TokenKind.QUANTIFIER, semanticHint: 'any' },
  { phrase: 'all', tokenType: TokenKind.QUANTIFIER, semanticHint: 'all' },
  { phrase: 'each', tokenType: TokenKind.QUANTIFIER, semanticHint: 'each' },
  { phrase: 'up to', tokenType: TokenKind.QUANTIFIER, semanticHint: 'up_to' },
  { phrase: 'a', tokenType: TokenKind.QUANTIFIER, semanticHint: 'one' },
  { phrase: 'an', tokenType: TokenKind.QUANTIFIER, semanticHint: 'one' },
];

/**
 * Range comparators, as their own token kind rather than quantifiers.
 *
 * This exists to break an ordering cycle. "or more" must beat the conjunction
 * "or", so its kind has to be tried first; but "each" (a quantifier) must lose
 * to "Each time" (a condition marker), and "after that" (a conjunction) must
 * beat "After" (a condition marker). Requiring quantifier < conjunction <
 * condition < quantifier is unsatisfiable, so the two comparators move out of
 * the quantifier set and the cycle disappears.
 */
const COMPARATORS: LexiconEntry[] = [
  {
    phrase: 'or more',
    tokenType: TokenKind.COMPARATOR,
    semanticHint: 'or_more',
  },
  {
    phrase: 'or less',
    tokenType: TokenKind.COMPARATOR,
    semanticHint: 'or_less',
  },
  {
    phrase: 'or lower',
    tokenType: TokenKind.COMPARATOR,
    semanticHint: 'or_less',
  },
  {
    phrase: 'or higher',
    tokenType: TokenKind.COMPARATOR,
    semanticHint: 'or_more',
  },
];

const PREPOSITIONS: LexiconEntry[] = [
  { phrase: 'from', tokenType: TokenKind.PREPOSITION, semanticHint: 'from' },
  { phrase: 'to', tokenType: TokenKind.PREPOSITION, semanticHint: 'to' },
  { phrase: 'in', tokenType: TokenKind.PREPOSITION, semanticHint: 'in' },
  { phrase: 'on', tokenType: TokenKind.PREPOSITION, semanticHint: 'on' },
  { phrase: 'of', tokenType: TokenKind.PREPOSITION, semanticHint: 'of' },
  { phrase: 'with', tokenType: TokenKind.PREPOSITION, semanticHint: 'with' },
  { phrase: 'by', tokenType: TokenKind.PREPOSITION, semanticHint: 'by' },
  // "flip this card INTO face-down Defense Position", "treat it AS a Continuous
  // Spell". Without these the trailing phrase reads as the start of a new
  // clause and the whole resolution fails.
  { phrase: 'into', tokenType: TokenKind.PREPOSITION, semanticHint: 'into' },
  { phrase: 'as', tokenType: TokenKind.PREPOSITION, semanticHint: 'as' },
  { phrase: 'among', tokenType: TokenKind.PREPOSITION, semanticHint: 'among' },
  { phrase: 'than', tokenType: TokenKind.PREPOSITION, semanticHint: 'than' },
  { phrase: 'for', tokenType: TokenKind.PREPOSITION, semanticHint: 'for' },
  { phrase: 'at', tokenType: TokenKind.PREPOSITION, semanticHint: 'at' },
];

/** `except "X"` carves names out of an otherwise matching family. */
const EXCEPTIONS: LexiconEntry[] = [
  { phrase: 'except', tokenType: TokenKind.EXCEPT, semanticHint: 'except' },
  { phrase: 'other than', tokenType: TokenKind.EXCEPT, semanticHint: 'except' },
];

/** The whole lexicon, in authoring order. Sorting happens at compile time. */
export const LEXICON: LexiconEntry[] = [
  ...CONDITIONS,
  ...FREQUENCIES,
  ...OPTIONALITY,
  ...SELECTION,
  ...VERBS,
  ...CONJUNCTIONS,
  ...REFERENCES,
  ...ZONES,
  ...OWNERS,
  ...ATTRIBUTES,
  ...STATS,
  ...MODIFIERS,
  ...POSITIONS,
  ...COMPARATORS,
  ...DISJUNCTION,
  ...QUANTIFIERS,
  ...PREPOSITIONS,
  ...EXCEPTIONS,
];

/** Escape a phrase for use inside a RegExp. */
function escape(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile one entry into a sticky-safe pattern.
 *
 * Internal whitespace becomes `\s+` so a line break collapsed to a space —
 * or a double space in the printed text — still matches. A trailing word
 * boundary stops "and" from matching inside "Android"; it is omitted when the
 * phrase ends in punctuation, where `\b` would behave backwards.
 */
export function patternFor(entry: LexiconEntry): RegExp {
  const body = escape(entry.phrase).replace(/\s+/g, '\\s+');
  const endsWithWordChar = /[A-Za-z0-9]$/.test(entry.phrase);
  const startsWithWordChar = /^[A-Za-z0-9]/.test(entry.phrase);
  const prefix = startsWithWordChar ? '\\b' : '';
  const suffix = endsWithWordChar ? '\\b' : '';
  return new RegExp(`${prefix}${body}${suffix}`, 'i');
}

/**
 * Order the lexicon longest-phrase-first so that no entry can shadow a longer
 * one that starts the same way. Ties break alphabetically, purely so the
 * compiled pattern is deterministic across runs.
 */
export function compileLexicon(
  entries: readonly LexiconEntry[] = LEXICON,
): LexiconEntry[] {
  return [...entries].sort((a, b) =>
    a.phrase.length !== b.phrase.length
      ? b.phrase.length - a.phrase.length
      : a.phrase.localeCompare(b.phrase),
  );
}
