/**
 * Stage 4b — syntactic parsing.
 *
 * A Chevrotain `CstParser` over PSCT's clause grammar. It is deliberately
 * conservative: it describes the shapes Konami actually prints and nothing
 * more, so text it does not cover fails loudly into a diagnostic rather than
 * being bent into a shape that parses but means the wrong thing.
 *
 * The parser does NOT see whole sentences. `structure.ts` has already split
 * each sentence on its structural colon and semicolon, so each rule here is
 * invoked on one clause part. That is what keeps the grammar LL(1)-ish and free
 * of backtracking: there is no rule that has to decide "is this leading clause
 * a condition or a resolution", because the separator already decided.
 *
 *     <condition> : <activation> ; <resolution>
 *                   ^^^^^^^^^^^^   ^^^^^^^^^^^^
 *                   activationClause   resolutionClause
 *
 * The condition part has no rule here on purpose — it is a leaf in the grammar
 * (as it is in the implementation guide's EBNF). It is kept verbatim and its
 * ruling-relevant properties are read off directly in `conditions.ts`; running
 * a grammar over free-form trigger prose would invent structure that the text
 * does not have.
 */

import { CstParser, tokenMatcher, type CstNode, type IToken } from 'chevrotain';
import { Comma, NounPart, PARSER_TOKENS, tokenFor } from './lexer';
import { TokenKind } from './lexicon';

const Verb = tokenFor(TokenKind.VERB);
const TargetVerb = tokenFor(TokenKind.TARGET_VERB);
const Modifier = tokenFor(TokenKind.MODIFIER);
const Conjunction = tokenFor(TokenKind.CONJUNCTION);
const Preposition = tokenFor(TokenKind.PREPOSITION);
const Reference = tokenFor(TokenKind.REFERENCE);
const YouCan = tokenFor(TokenKind.YOU_CAN);

/**
 * The PSCT clause parser.
 *
 * Error recovery is OFF, and that is not a default left unexamined. With
 * recovery enabled, Chevrotain may repair a failing required `CONSUME` by
 * pretending the token was there; inside `actionSequence`'s `MANY` that lets
 * the loop body "succeed" without consuming anything, and the parse spins
 * forever. Chevrotain still records a failure in `parser.errors` and returns
 * the partial CST it built before the failure, so a clause with one
 * unparseable fragment keeps everything that parsed up to it — which is the
 * behaviour recovery was wanted for, without the hang.
 */
class PsctParser extends CstParser {
  constructor() {
    super(PARSER_TOKENS, {
      // Three is enough for the `OPTION(Comma) OPTION(Conjunction)
      // OPTION(Comma)` separator run in `actionSequence`; more costs analysis
      // time at startup for no benefit.
      maxLookahead: 3,
      recoveryEnabled: false,
    });
    this.performSelfAnalysis();
  }

  /** `<resolution>` — what happens when the effect resolves. */
  public resolutionClause = this.RULE('resolutionClause', () => {
    this.SUBRULE(this.actionSequence);
  });

  /**
   * `ActionGroup (Conjunction ActionGroup)*`
   *
   * The conjunction is captured, not discarded: it is the only thing in the
   * text that says whether a later action still happens when an earlier one
   * fails. See `DEPENDENT_CONJUNCTIONS`.
   *
   * Commas are consumed on either side of the conjunction because Konami
   * prints all three of "A, then B", "A and if you do, B" and "A; also, B".
   */
  public actionSequence = this.RULE('actionSequence', () => {
    this.SUBRULE(this.actionGroup);
    this.MANY(() => {
      this.SUBRULE(this.separator);
      this.SUBRULE2(this.actionGroup, { LABEL: 'tail' });
    });
  });

  /**
   * The run of punctuation and conjunctions between two action groups.
   *
   * It is a rule of its own, and allows MORE THAN ONE conjunction, because
   * Konami stacks them:
   *
   *     Special Summon 1 monster from your hand, ALSO, AFTER THAT, change
   *     this card to Defense Position.          ^^^^^^^^^^^^^^^^^^
   *
   * The previous version allowed exactly one conjunction, so the second one
   * had nowhere to go: the parse failed inside the sequence loop and discarded
   * the ENTIRE resolution — Goblindbergh lost its Special Summon outright.
   * Grouping the run into a subrule also keeps the conjunctions attached to the
   * right tail; a flat token list indexed by tail position silently mispairs as
   * soon as one separator holds two.
   */
  public separator = this.RULE('separator', () => {
    this.OPTION(() => this.CONSUME(Comma));
    this.MANY(() => {
      this.CONSUME(Conjunction);
      this.OPTION2(() => this.CONSUME2(Comma));
    });
  });

  /**
   * One unit of a resolution: either something that HAPPENS or a state that
   * APPLIES.
   *
   * The two alternatives are told apart by their first token with no lookahead
   * beyond one: an action opens with a verb (or "You can" before it), while a
   * modifier clause opens with its subject or with the modifier itself. That
   * disjointness is maintained by the lexicon — it is why "gain"/"loses" are
   * `Modifier` tokens and "draw"/"destroy" are `Verb` tokens.
   */
  public actionGroup = this.RULE('actionGroup', () => {
    // "You can" is hoisted out of the alternatives rather than repeated inside
    // them. Inside, every alternative would share it as a first token and the
    // OR could no longer be decided by one: "You can target 1 monster" would
    // commit to the action alternative and then fail on `target`.
    this.OPTION(() => this.CONSUME(YouCan));
    this.OR([
      { ALT: () => this.SUBRULE(this.actionClause) },
      { ALT: () => this.SUBRULE(this.modifierClause) },
    ]);
  });

  /** `Verb [Object] PrepPhrase* (, Qualifier)*` */
  public actionClause = this.RULE('actionClause', () => {
    this.CONSUME(Verb);
    this.OPTION2(() => this.SUBRULE(this.objectPhrase));
    this.MANY(() => this.SUBRULE(this.prepPhrase));
    this.SUBRULE(this.qualifiers);
  });

  /**
   * Trailing qualifiers: `, face-down`, `, in Defense Position`.
   *
   * PSCT appends these after a comma, and they belong to the clause they follow
   * rather than starting a new one. Without this rule Pot of Desires' "Banish
   * 10 cards from the top of your Deck, face-down;" reads the comma as an item
   * separator and then fails on "face-down", losing the whole cost.
   *
   * It requires a noun phrase after the comma, so "A, then B" is left to the
   * enclosing sequence rule — "then" is a conjunction, not noun material.
   */
  public qualifiers = this.RULE('qualifiers', () => {
    this.MANY({
      // The GATE is load-bearing. Chevrotain decides whether to enter a loop
      // from the body's FIRST token, which here is the comma — and a comma also
      // precedes a conjunction ("..., then end the Battle Phase"). Entering on
      // the comma alone commits to a noun phrase that never arrives and fails
      // the whole clause, so the second token has to be inspected too.
      GATE: () => tokenMatcher(this.LA(2), NounPart),
      DEF: () => {
        this.CONSUME(Comma);
        this.SUBRULE(this.nounPhrase);
      },
    });
  });

  /**
   * `[Subject] Modifier [Complement] PrepPhrase*`
   *
   * Covers both "All "Qli" monsters you control gain 300 ATK" (explicit
   * subject) and "cannot be destroyed by battle" (implicit subject, which
   * `references.ts` resolves to the card itself).
   */
  public modifierClause = this.RULE('modifierClause', () => {
    this.OPTION(() => this.SUBRULE(this.objectPhrase, { LABEL: 'subject' }));
    // The subject may carry its own prepositional phrases BEFORE the modifier:
    // "All FIRE monsters on the field gain 500 ATK". Without this the clause
    // fails at "on", which silently cost every card of that very common shape.
    this.MANY2(() => this.SUBRULE2(this.prepPhrase, { LABEL: 'subjectPrep' }));
    this.CONSUME(Modifier);
    this.OPTION2(() =>
      this.SUBRULE2(this.objectPhrase, { LABEL: 'complement' }),
    );
    this.MANY(() => this.SUBRULE(this.prepPhrase));
    this.SUBRULE(this.qualifiers);
  });

  /**
   * `<activation>` — the half between the colon and the semicolon.
   *
   * Everything here is a cost or a target declaration, by position: this is the
   * part of the clause the player pays and commits to on activation, before
   * anything resolves. Classifying by position rather than by verb is what
   * stops One for One's "Send 1 monster from your hand to the GY;" from being
   * read as a resolution action.
   */
  public activationClause = this.RULE('activationClause', () => {
    this.SUBRULE(this.activationItem);
    this.MANY(() => {
      this.OPTION(() => this.CONSUME(Comma));
      this.OPTION2(() => this.CONSUME(Conjunction));
      this.OPTION3(() => this.CONSUME2(Comma));
      this.SUBRULE2(this.activationItem, { LABEL: 'tail' });
    });
  });

  public activationItem = this.RULE('activationItem', () => {
    // Hoisted for the same reason as in `actionGroup`: "You can discard 1 card"
    // and "You can target 1 monster" differ only after the shared "You can".
    this.OPTION(() => this.CONSUME(YouCan));
    this.OR([
      { ALT: () => this.SUBRULE(this.targetClause) },
      { ALT: () => this.SUBRULE(this.actionClause) },
      { ALT: () => this.SUBRULE(this.modifierClause) },
    ]);
  });

  /**
   * `TargetVerb [Object] PrepPhrase*`
   *
   * Its own rule rather than a verb, because targeting is a technical game
   * action with its own rules — it can be stopped by targeting protection and
   * the choice is locked in at activation — and because the printed word
   * ("target" / "choose" / "select") decides which, with "select" genuinely
   * undetermined.
   */
  public targetClause = this.RULE('targetClause', () => {
    this.CONSUME(TargetVerb);
    this.OPTION(() => this.SUBRULE(this.objectPhrase));
    this.MANY(() => this.SUBRULE(this.prepPhrase));
    this.SUBRULE(this.qualifiers);
  });

  /**
   * What a verb or modifier acts on: a pronoun, or a described noun phrase.
   *
   * The pronoun alternative comes first and is a single token, so "destroy it"
   * produces a `Reference` the resolution pass can link to an antecedent in an
   * earlier clause, instead of an anonymous one-word noun phrase that no
   * consumer could use.
   */
  public objectPhrase = this.RULE('objectPhrase', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Reference);
          // A POSSESSIVE reference is followed by what it owns: "this card's
          // ATK", "that monster's name". The reference still identifies the
          // entity; the trailing noun phrase says which of its properties the
          // clause is about.
          this.OPTION(() => this.SUBRULE(this.nounPhrase));
        },
      },
      { ALT: () => this.SUBRULE2(this.nounPhrase) },
    ]);
  });

  /**
   * A run of descriptor tokens.
   *
   * One `CONSUME` of the `NounPart` category rather than an `OR` over every
   * descriptor kind; see the category's definition in `lexer.ts` for what is
   * and is not a member, and why.
   */
  public nounPhrase = this.RULE('nounPhrase', () => {
    this.AT_LEAST_ONE(() => this.CONSUME(NounPart));
  });

  /**
   * `Preposition NounPhrase` — "from your Deck", "to your hand", "on the field".
   *
   * These carry the source zones and the destination, which is why they are
   * structure rather than trailing prose: "add 1 monster from your Deck to your
   * hand" and "add 1 monster from your GY to your hand" differ only here.
   */
  public prepPhrase = this.RULE('prepPhrase', () => {
    this.CONSUME(Preposition);
    // `objectPhrase`, not `nounPhrase`: the object of a preposition is very
    // often a PRONOUN — "place 1 A-Counter on this card", "detach 1 material
    // from this card", "return it to the hand". `Reference` is deliberately
    // excluded from the `NounPart` category (so that "destroy it" yields a
    // resolvable reference rather than an anonymous descriptor), which meant a
    // bare `nounPhrase` here could not match any of them. That single omission
    // was the largest source of failed clauses in the pool — ~1,680 of them.
    this.SUBRULE(this.objectPhrase);
  });
}

/**
 * One shared parser instance.
 *
 * Chevrotain's self-analysis is expensive and its parser objects are
 * reusable — `input` is reset per parse — so building one at module load keeps
 * a 14k-card batch run from paying grammar analysis 14k times.
 */
export const psctParser = new PsctParser();

export interface ParseAttempt {
  cst: CstNode | null;
  errors: {
    message: string;
    token: IToken | null;
  }[];
}

/**
 * The rules that may be invoked as an entry point.
 *
 * `actionGroup` is an entry point so ONE conjunct can be parsed on its own.
 * That is what makes segment-level recovery possible: when a resolution fails
 * as a whole, each conjunct is retried in isolation and the ones that parse are
 * kept, instead of the whole clause being discarded because of one bad part.
 */
export type EntryRule = 'resolutionClause' | 'activationClause' | 'actionGroup';

/**
 * Run one grammar rule over a token array.
 *
 * Never throws: a failed parse comes back as `cst: null` plus errors, which the
 * pipeline turns into a `GRAMMAR_PARSE_ERROR` diagnostic. A card with one
 * unparseable clause must still yield everything else it says.
 */
export function parseTokens(tokens: IToken[], rule: EntryRule): ParseAttempt {
  if (tokens.length === 0) return { cst: null, errors: [] };

  psctParser.input = tokens;
  const cst = psctParser[rule]() as CstNode | undefined;

  const errors = psctParser.errors.map((e) => ({
    message: e.message,
    token: e.token ?? null,
  }));

  // Chevrotain keeps errors on the instance; clear them so the next parse
  // starts clean. Missing this makes every later card inherit this card's
  // failures, which silently poisons the whole batch's diagnostics.
  psctParser.errors = [];

  return { cst: cst ?? null, errors };
}
