/**
 * Stage 4a — structure: blocks, sentences, and PSCT clause parts.
 *
 * This runs on the TOKEN STREAM rather than on text, which is what makes it
 * reliable. Because `lexer.ts` matches quoted names, parentheticals and block
 * headers as single tokens, every `Colon`, `Semicolon` and `Period` token left
 * in the stream is structural by construction: the colon in
 * `"Number 39: Utopia"` and the periods in `"D.D. Crow"` are inside a
 * `QuotedName` token and simply are not separators. A text-level splitter has
 * to defend against those cases one regex at a time; a token-level splitter
 * cannot see them at all.
 *
 * PSCT's sentence grammar is:
 *
 *     <condition> : <cost / target> ; <resolution>
 *
 * with the condition and the cost half each optional. Splitting on it is what
 * keeps a trigger condition from ever becoming an action — Sangan's "If this
 * card is sent from the field to the GY:" contains both *sent* and *GY*, but
 * the action rules never see it — and keeps a cost from becoming an action, as
 * One for One's "Send 1 monster from your hand to the GY;" lands in the cost
 * part.
 */

import type { IToken } from 'chevrotain';
import { BlockKind } from './ast';
import type { BlockKind as BlockKindType } from './ast';
import {
  BlockHeader,
  Bullet,
  Colon,
  Comma,
  LineBreak,
  Other,
  Parenthetical,
  Period,
  Semicolon,
} from './lexer';
import { tokenFor } from './lexer';
import { TokenKind } from './lexicon';

const ConditionMarker = tokenFor(TokenKind.CONDITION_MARKER);
const YouCan = tokenFor(TokenKind.YOU_CAN);
const Frequency = tokenFor(TokenKind.FREQUENCY);
const TargetVerb = tokenFor(TokenKind.TARGET_VERB);
const Verb = tokenFor(TokenKind.VERB);
const Modifier = tokenFor(TokenKind.MODIFIER);

/**
 * Tokens that mean a clause still DOES something.
 *
 * Used to keep the trailing-condition split conservative: if any of these
 * appears after a condition marker, the marker introduces a clause that
 * performs an action, and splitting there would silently discard it.
 */
const ACTION_BEARING = [Verb, Modifier, TargetVerb];
const Conjunction = tokenFor(TokenKind.CONJUNCTION);

export interface TokenBlock {
  index: number;
  kind: BlockKindType;
  tokens: IToken[];
  /**
   * For BULLET blocks: the tokens preceding the bullet list, which carry the
   * governing trigger, cost and activation punctuation.
   *
   * "You can discard 1 card, then activate 1 of these effects;" states the cost
   * once, above the list, and it applies to whichever bullet the player picks.
   * The pipeline parses this once per group and prepends it to every bullet's
   * activation — see `Inherited` in `index.ts`. ~525 cards in the pool state a
   * cost or a target this way, so a bullet that did not inherit it would read
   * as a free effect.
   */
  leadIn?: IToken[];
  /**
   * True when the lead-in marks the bullets as effects the card NEGATES rather
   * than effects it performs. Ash Blossom is the canonical case: its bullets
   * read "Add a card from the Deck to the hand", which describes what it stops.
   * Rare — a couple of cards — but exactly the cards a naive parser gets
   * spectacularly wrong.
   */
  quotedEffects: boolean;
  /**
   * True for the block that IS a bullet list's lead-in.
   *
   * It is emitted as a block of its own because it sometimes carries a real
   * effect (Ash Blossom's "You can discard this card; negate that effect."),
   * but when it only introduces the list its cost belongs to the bullets
   * rather than to a cost-with-no-resolution effect of its own. The pipeline
   * needs the flag to tell those two cases apart.
   */
  isLeadIn?: boolean;
}

/** A lead-in that quotes effects instead of instructing them. */
const QUOTED_EFFECTS_RE =
  /\b(?:includes?|include)\s+any\s+of\s+(?:these|the following)\s+effects\b/i;

/** Reassemble token images, for the verbatim text a node carries. */
export function imagesOf(tokens: IToken[]): string {
  return (
    tokens
      .map((t) => t.image)
      .join(' ')
      // Punctuation does not take a leading space.
      .replace(/\s+([.,;:)])/g, '$1')
      .replace(/\(\s+/g, '(')
      .trim()
  );
}

/**
 * Split the token stream into effect blocks.
 *
 * Pendulum cards print two independent bodies under `[Pendulum Effect]` and
 * `[Monster Effect]` headers; Link and multi-effect monsters print bulleted
 * lists. Each bullet becomes its own block carrying the shared lead-in, so a
 * cost stated once before the list is neither lost nor double-counted.
 */
export function splitBlocks(tokens: IToken[]): TokenBlock[] {
  const named: { kind: BlockKindType; tokens: IToken[] }[] = [];
  let current: { kind: BlockKindType; tokens: IToken[] } = {
    kind: BlockKind.MAIN,
    tokens: [],
  };

  for (const token of tokens) {
    if (token.tokenType === BlockHeader) {
      if (current.tokens.length) named.push(current);
      current = {
        kind: /pendulum/i.test(token.image)
          ? BlockKind.PENDULUM
          : BlockKind.MONSTER,
        tokens: [],
      };
      continue;
    }
    current.tokens.push(token);
  }
  if (current.tokens.length) named.push(current);

  const blocks: TokenBlock[] = [];
  let index = 0;

  for (const { kind, tokens: blockTokens } of named) {
    const bulletAt = blockTokens.findIndex((t) => t.tokenType === Bullet);
    if (bulletAt === -1) {
      blocks.push({
        index: index++,
        kind,
        tokens: blockTokens,
        quotedEffects: false,
      });
      continue;
    }

    const leadIn = blockTokens.slice(0, bulletAt);
    const quotedEffects = QUOTED_EFFECTS_RE.test(imagesOf(leadIn));

    // The lead-in is itself an effect body when it does more than introduce the
    // list — Ash Blossom's "You can discard this card; negate that effect."
    if (leadIn.length) {
      blocks.push({
        index: index++,
        kind,
        tokens: leadIn,
        quotedEffects: false,
        isLeadIn: true,
      });
    }

    let bulletTokens: IToken[] = [];
    for (const token of blockTokens.slice(bulletAt + 1)) {
      if (token.tokenType === Bullet) {
        if (bulletTokens.length) {
          blocks.push({
            index: index++,
            kind: BlockKind.BULLET,
            tokens: bulletTokens,
            leadIn: leadIn.length ? leadIn : undefined,
            quotedEffects,
          });
        }
        bulletTokens = [];
        continue;
      }
      bulletTokens.push(token);
    }
    if (bulletTokens.length) {
      blocks.push({
        index: index++,
        kind: BlockKind.BULLET,
        tokens: bulletTokens,
        leadIn: leadIn.length ? leadIn : undefined,
        quotedEffects,
      });
    }
  }

  return blocks;
}

/**
 * Split a block into sentences on `Period` tokens.
 *
 * Every surviving `Period` is a real sentence boundary: abbreviations in card
 * text live inside card names ("D.D. Crow") or inside parenthetical asides,
 * and both are single tokens by the time this runs. That is why there is no
 * abbreviation list here — the token stream has already made one unnecessary.
 *
 * The period is kept on the sentence it ends, so a sentence's span covers its
 * own punctuation.
 */
export function splitSentences(tokens: IToken[]): IToken[][] {
  const sentences: IToken[][] = [];
  let current: IToken[] = [];

  const flush = () => {
    if (current.length) sentences.push(current);
    current = [];
  };

  for (const token of tokens) {
    if (token.tokenType === LineBreak) {
      // A line break ends a sentence only when what precedes it is an Extra
      // Deck MATERIALS line — '"Baby Dragon" + "Alligator\'s Sword"' — which
      // carries no terminating period. Without this the materials line merges
      // with the effect text that follows it, and the materials-line rule in
      // `restrictions.ts` then discards a real effect along with it.
      //
      // Every other line break is a cosmetic wrap (~2,000 cards wrap
      // mid-sentence) and is dropped, so it must NOT split.
      if (isMaterialsLine(current)) flush();
      continue;
    }

    current.push(token);
    if (token.tokenType === Period) flush();
  }
  flush();

  return sentences.filter((s) => s.some((t) => t.tokenType !== Period));
}

/**
 * Does this run of tokens look like an Extra Deck materials line?
 *
 * The test is a `+` joining descriptors, with no sentence-ending period yet.
 * That is the shape of every Fusion, Synchro and Link materials line and of
 * nothing else — ordinary effect text does not use `+`.
 */
function isMaterialsLine(tokens: IToken[]): boolean {
  if (tokens.length === 0) return false;
  if (tokens.some((t) => t.tokenType === Period)) return false;
  return tokens.some((t) => t.tokenType === Other && t.image === '+');
}

export interface ClauseParts {
  /** Before the colon, or the legacy comma-delimited lead. May be empty. */
  condition: IToken[];
  /** Between the colon and the semicolon: costs and target declarations. */
  activation: IToken[];
  /** After the semicolon, or the whole sentence when unpunctuated. */
  resolution: IToken[];
  /**
   * A condition printed at the END of the resolution rather than before the
   * colon: "destroy 1 card on the field **if you control a Dragon monster**".
   *
   * Kept apart from `condition` because it gates APPLICATION, not activation —
   * see `ConditionPosition`. Empty for most sentences.
   */
  trailingCondition: IToken[];
  /**
   * A `, but ...` rider: "Add 1 monster ... to your hand, **but you cannot
   * activate cards ... for the rest of this turn**".
   *
   * Peeled off because feeding it to the grammar does not merely fail on the
   * rider — it destroys the WHOLE resolution, taking the primary action with
   * it. Sangan lost its Add that way. 948 cards in the pool carry such a
   * rider, 810 of them alongside a search verb.
   *
   * Kept verbatim. `Conjunction.BUT` is documented as a qualification on what
   * precedes rather than a further action, and the restriction patterns in
   * `restrictions.ts` already read these from the sentence text.
   */
  trailingRider: IToken[];
  /** True when a colon or semicolon was present. Drives `startsChain`. */
  hasActivationPunctuation: boolean;
  /**
   * True when the condition was recovered from a comma rather than a colon,
   * i.e. the printing predates PSCT. Consumers use this to avoid reporting
   * `startsChain: false` for text that simply has no colon yet.
   */
  legacyCondition: boolean;
}

/** Index of the first token of `type` at the top level, or -1. */
function indexOfToken(tokens: IToken[], type: typeof Colon): number {
  return tokens.findIndex((t) => t.tokenType === type);
}

/**
 * Split one sentence into its PSCT parts.
 *
 * Four shapes occur, and the first colon and semicolon decide between them:
 *
 *   condition : cost ; resolution   full activated effect
 *   condition : resolution          activated effect with no cost
 *   cost ; resolution               cost-first effect, e.g. "Target 1 ...; destroy it."
 *   resolution                      continuous effect, or legacy text
 *
 * Only the FIRST colon is structural. Later colons belong to nested text, and
 * taking a later one would move the boundary past the real activation.
 */
export function splitClause(sentence: IToken[]): ClauseParts {
  const parts = splitClauseParts(sentence);
  // Rider first: a condition inside a rider belongs to the rider, not to the
  // resolution it qualifies.
  const { resolution: withoutRider, trailingRider } = splitTrailingRider(
    parts.resolution,
  );
  const { resolution, trailingCondition } =
    splitTrailingCondition(withoutRider);
  return { ...parts, resolution, trailingCondition, trailingRider };
}

/**
 * Peel a `, but ...` rider off the end of a resolution.
 *
 * Unlike the trailing-condition split this does NOT refuse when the rider
 * contains an action. The alternative is worse: leaving it in makes the parse
 * fail inside `actionSequence`'s loop, which discards the entire resolution
 * including the primary action. Keeping the primary action and declaring the
 * rider beats losing both — and the pipeline raises a diagnostic whenever a
 * peeled rider contained an action, so nothing is dropped silently.
 */
function splitTrailingRider(resolution: IToken[]): {
  resolution: IToken[];
  trailingRider: IToken[];
} {
  const none = { resolution, trailingRider: [] as IToken[] };

  let butAt = -1;
  for (let i = resolution.length - 1; i > 0; i--) {
    const token = resolution[i];
    if (token.tokenType === Conjunction && /^but$/i.test(token.image)) {
      butAt = i;
      break;
    }
  }
  if (butAt === -1) return none;

  let end = butAt;
  while (end > 0 && resolution[end - 1].tokenType === Comma) end--;

  const head = resolution.slice(0, end);
  if (head.length === 0) return none;

  return { resolution: head, trailingRider: resolution.slice(butAt) };
}

/**
 * One conjunct of a resolution: the conjunction run that introduced it, and
 * its own tokens.
 */
export interface ResolutionSegment {
  /** Empty for the first segment, which depends on nothing. */
  conjunctions: IToken[];
  tokens: IToken[];
}

/**
 * Split a resolution into conjuncts at its TOP-LEVEL conjunctions.
 *
 * This exists so a failure can be contained. Parsed as one clause, a single
 * unparseable conjunct fails inside the sequence rule and discards the entire
 * resolution — measured across the pool, that is the single largest cause of
 * lost search actions (529 of the 980 cards the older parser resolves and this
 * one does not). Segmenting lets the pipeline keep every conjunct that parses
 * and report only the ones that do not.
 *
 * Bare "and" is NOT a split point unless an action follows it. "1 Warrior and 1
 * Spellcaster monster" is one noun phrase, and splitting it would turn a single
 * object into two broken fragments. The other conjunctions ("then", "also",
 * "and if you do", "after that") only ever join clauses, so they always split.
 */
export function splitResolutionSegments(
  resolution: IToken[],
): ResolutionSegment[] {
  const segments: ResolutionSegment[] = [];
  let conjunctions: IToken[] = [];
  let current: IToken[] = [];

  const flush = () => {
    if (current.length) segments.push({ conjunctions, tokens: current });
    conjunctions = [];
    current = [];
  };

  for (let i = 0; i < resolution.length; i++) {
    const token = resolution[i];

    if (token.tokenType === Conjunction && isSplitPoint(resolution, i)) {
      // A comma immediately before the conjunction belongs to the separator,
      // not to the conjunct it closes.
      while (
        current.length &&
        current[current.length - 1].tokenType === Comma
      ) {
        current.pop();
      }
      const pendingConjunctions = [...conjunctions, token];
      flush();
      conjunctions = pendingConjunctions;
      continue;
    }

    // A comma directly after the separator is part of it ("also, after that,").
    if (
      current.length === 0 &&
      conjunctions.length > 0 &&
      token.tokenType === Comma
    ) {
      continue;
    }

    current.push(token);
  }

  flush();
  return segments;
}

/** Whether the conjunction at `index` joins CLAUSES rather than noun phrases. */
function isSplitPoint(resolution: IToken[], index: number): boolean {
  const image = resolution[index].image.toLowerCase().replace(/\s+/g, ' ');
  if (image !== 'and') return true;

  // Bare "and": only a separator when something that performs an action follows
  // it before the next conjunction.
  for (let i = index + 1; i < resolution.length; i++) {
    const t = resolution[i];
    if (t.tokenType === Conjunction) return false;
    if (ACTION_BEARING.includes(t.tokenType)) return true;
    if (t.tokenType === YouCan) return true;
  }
  return false;
}

/** True when a peeled rider still contained something that performs an action. */
export function hasActionToken(tokens: IToken[]): boolean {
  return tokens.some((t) => ACTION_BEARING.includes(t.tokenType));
}

/**
 * Peel a trailing condition off the end of a resolution.
 *
 * PSCT appends an application condition after the action: "destroy 1 card on
 * the field if you control a Dragon monster", "Special Summon 1 monster during
 * your Main Phase". The grammar has no rule for it — like the leading
 * condition, it is free-form prose and imposing a grammar on it would invent
 * structure — so it is split off here and kept verbatim.
 *
 * Deliberately CONSERVATIVE in two ways:
 *
 *  - it takes the LAST condition marker, not the first, so a sentence with
 *    several only loses its tail;
 *  - it refuses to split when any action-bearing token follows the marker.
 *    "..., then if you control X, draw 1 card" keeps its "draw", and simply
 *    stays a reported warning. Losing an action to tidy up a diagnostic would
 *    be exactly the wrong trade.
 */
function splitTrailingCondition(resolution: IToken[]): {
  resolution: IToken[];
  trailingCondition: IToken[];
} {
  const none = { resolution, trailingCondition: [] as IToken[] };

  // From the end, and never index 0: a marker that OPENS the resolution is
  // part of it, not a trailing qualifier on it.
  let markerAt = -1;
  for (let i = resolution.length - 1; i > 0; i--) {
    if (resolution[i].tokenType === ConditionMarker) {
      markerAt = i;
      break;
    }
  }
  if (markerAt === -1) return none;

  const tail = resolution.slice(markerAt);
  if (tail.some((t) => ACTION_BEARING.includes(t.tokenType))) return none;

  // Drop the comma that merely separated the condition from what precedes it.
  let end = markerAt;
  while (end > 0 && resolution[end - 1].tokenType === Comma) end--;

  // Nothing left to resolve means this was not a trailing qualifier at all.
  const head = resolution.slice(0, end);
  if (head.length === 0) return none;

  return { resolution: head, trailingCondition: tail };
}

function splitClauseParts(
  sentence: IToken[],
): Omit<ClauseParts, 'trailingCondition' | 'trailingRider'> {
  const colonAt = indexOfToken(sentence, Colon);
  const semicolonAt = sentence.findIndex(
    (t, i) => t.tokenType === Semicolon && i > colonAt,
  );

  const hasActivationPunctuation = colonAt !== -1 || semicolonAt !== -1;

  if (colonAt !== -1 && semicolonAt !== -1) {
    return {
      condition: sentence.slice(0, colonAt),
      activation: sentence.slice(colonAt + 1, semicolonAt),
      resolution: sentence.slice(semicolonAt + 1),
      hasActivationPunctuation,
      legacyCondition: false,
    };
  }

  if (colonAt !== -1) {
    return {
      condition: sentence.slice(0, colonAt),
      activation: [],
      resolution: sentence.slice(colonAt + 1),
      hasActivationPunctuation,
      legacyCondition: false,
    };
  }

  if (semicolonAt !== -1) {
    return {
      condition: [],
      activation: sentence.slice(0, semicolonAt),
      resolution: sentence.slice(semicolonAt + 1),
      hasActivationPunctuation,
      legacyCondition: false,
    };
  }

  /**
   * A legacy sentence that only DECLARES a selection, with the action in the
   * next sentence: "Select 1 monster on the field. Destroy it."
   *
   * Modern PSCT puts the selection in the activation half of the same sentence;
   * pre-errata text gave it a sentence of its own. Treating it as an activation
   * rather than a resolution is both what it means — it selects and performs
   * nothing — and what lets the following sentence's "it" find its antecedent.
   */
  if (sentence[0]?.tokenType === TargetVerb) {
    return {
      condition: [],
      activation: sentence,
      resolution: [],
      hasActivationPunctuation: false,
      legacyCondition: false,
    };
  }

  return splitLegacy(sentence);
}

/**
 * Recover a condition from an unpunctuated (pre-2011) sentence.
 *
 * Before PSCT, a trigger condition was separated by a comma rather than a
 * colon: Botanical Girl reads "When this card is sent from the field to the GY,
 * you can add 1 ...". Without this the whole sentence reads as a resolution and
 * the condition's verbs ("sent", "GY") become actions, which is precisely the
 * false positive the colon split exists to prevent.
 *
 * Deliberately narrow: the sentence must OPEN with a condition marker, and the
 * split is at the first comma. A comma anywhere else in legacy text is far more
 * likely to be separating a noun phrase than a clause.
 */
function splitLegacy(
  sentence: IToken[],
): Omit<ClauseParts, 'trailingCondition' | 'trailingRider'> {
  const first = sentence[0];
  const opensWithCondition =
    first?.tokenType === ConditionMarker ||
    // "(Quick Effect): ..." style parentheticals, and "Once per turn," leads.
    first?.tokenType === Frequency ||
    (first?.tokenType === Parenthetical && /quick effect/i.test(first.image));

  if (!opensWithCondition) {
    return {
      condition: [],
      activation: [],
      resolution: sentence,
      hasActivationPunctuation: false,
      legacyCondition: false,
    };
  }

  const commaAt = sentence.findIndex((t) => t.tokenType === Comma);
  if (commaAt === -1) {
    return {
      condition: [],
      activation: [],
      resolution: sentence,
      hasActivationPunctuation: false,
      legacyCondition: false,
    };
  }

  // A legacy condition is only credible if something follows it that could be
  // a resolution. "During your Main Phase, ..." with nothing after the comma is
  // not a clause split.
  const rest = sentence.slice(commaAt + 1);
  if (!rest.some((t) => t.tokenType !== Period)) {
    return {
      condition: [],
      activation: [],
      resolution: sentence,
      hasActivationPunctuation: false,
      legacyCondition: false,
    };
  }

  return {
    condition: sentence.slice(0, commaAt),
    activation: [],
    resolution: rest,
    hasActivationPunctuation: false,
    legacyCondition: true,
  };
}

/** True when the sentence contains an optionality marker ("You can"). */
export function isOptional(sentence: IToken[]): boolean {
  return sentence.some((t) => t.tokenType === YouCan && /can/i.test(t.image));
}
