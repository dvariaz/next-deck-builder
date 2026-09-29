import type {
  EffectPredicate,
  EffectQuantity,
  EffectTarget,
  ParserContext,
} from './card-effect.types';
import { unmaskBare } from './normalize';
import { isEmptyPredicate, parsePredicate } from './predicate';

/**
 * Stage 5 — turn a target noun phrase into an EffectTarget.
 *
 * Operates on masked text, where every quoted card name is a `Q<n>` token.
 * Whether a token names a specific card or an archetype is decided by what
 * follows it: `"Sangan"` alone is a card, `"Sky Striker Ace" monster` is an
 * archetype plus a noun.
 */

const MASK_TOKEN_GLOBAL_RE = /\u0001Q(\d+)\u0001/g;

const SELF_RE = /^(?:this card|this monster)$/i;

/**
 * A noun that marks a quoted token as naming a family rather than one card:
 * `"Sky Striker Ace" monster` vs `"Sky Striker Ace - Raye"`.
 *
 * Unanchored, because descriptors may sit between the token and the noun
 * (`1 "HERO" Warrior monster`). Safe because the phrase has already been cut
 * at the first zone reference, so only a few words follow the token.
 */
const ARCHETYPE_NOUN_RE =
  /\b(?:monsters?|cards?|Spells?|Traps?|Fusion|Synchro|Xyz|Link|Ritual|Pendulum|Tuner)\b/i;

const EXCEPT_RE = /\s*,?\s*\bexcept\s+(.+)$/i;

const QUANTITY_RE = /^\s*(?:(up to)\s+)?(\d+)\b/i;
const ANY_NUMBER_RE = /\bany number of\b/i;

/** Leading article/quantity words that are not part of the description. */
const LEADING_NOISE_RE = /^\s*(?:up to\s+)?(?:\d+|a|an|any|the|1 of)\s+/i;

export interface ParsedTarget {
  target: EffectTarget;
  quantity: EffectQuantity;
  /** Names lifted from an `except` clause; also mirrored onto the predicate. */
  exceptNames: string[];
}

/** "1" / "up to 3" / "any number of" → a quantity range. */
export function parseQuantity(np: string): EffectQuantity {
  if (ANY_NUMBER_RE.test(np)) return 'ANY';
  const match = QUANTITY_RE.exec(np);
  if (!match) return 'ANY';
  const count = Number(match[2]);
  return match[1] ? { min: 0, max: count } : { min: count, max: count };
}

/**
 * Names from an `except "A", "B"` clause anywhere in a fragment. Used by the
 * action matcher, which sees the whole resolution segment.
 */
export function extractExceptNames(
  fragment: string,
  names: string[],
): string[] {
  const match = EXCEPT_RE.exec(fragment);
  if (!match) return [];
  return tokensIn(match[1])
    .map((t) => names[t.index])
    .filter((n): n is string => n !== undefined);
}

/** Every mask token in the phrase, with the offset just past each one. */
function tokensIn(np: string): { index: number; end: number }[] {
  return [...np.matchAll(MASK_TOKEN_GLOBAL_RE)].map((m) => ({
    index: Number(m[1]),
    end: (m.index ?? 0) + m[0].length,
  }));
}

/**
 * Words that are archetype names AND part of the game's structural vocabulary.
 *
 * The pool contains literal archetypes called "Warrior", "Fairy", "Fusion",
 * "Synchro", "Xyz" and "Pendulum". Every one of those also appears in ordinary
 * effect text as a monster Type or a summon class, so matching them bare turns
 * "1 Level 4 or lower Warrior monster" into `archetype: 'Warrior'` - which
 * narrows a 600-card search down to one small archetype. Quoted occurrences
 * still resolve normally; only the unquoted path is blocked.
 */
const STRUCTURAL_WORDS = new Set([
  'Fusion',
  'Synchro',
  'Xyz',
  'Link',
  'Ritual',
  'Pendulum',
  'Tuner',
  'Normal',
  'Effect',
  'Token',
  'Monster',
  'Spell',
  'Trap',
  'Level',
  'Rank',
  'Set',
  'Field',
  'Equip',
  'Counter',
  'Continuous',
  'Union',
]);

const escapeRe = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Longest-match an unquoted archetype. Modern PSCT quotes archetype names, but
 * older reprints are inconsistent and some archetypes are printed bare
 * ("@Ignister", "Danger!").
 *
 * Skips anything that is also a monster Type or structural vocabulary, and
 * matches on word boundaries so "Fairy" does not fire inside "Fairy Tail".
 */
function matchBareArchetype(
  np: string,
  ctx: ParserContext,
): string | undefined {
  let best: string | undefined;

  for (const archetype of ctx.archetypes) {
    if (!archetype) continue;
    if (STRUCTURAL_WORDS.has(archetype)) continue;
    if (ctx.races.has(archetype)) continue;
    if (best && archetype.length <= best.length) continue;
    if (!new RegExp(`\\b${escapeRe(archetype)}\\b`).test(np)) continue;
    best = archetype;
  }

  return best;
}

/**
 * Split points in a disjunction of two DIFFERENTLY SHAPED targets:
 * `1 "Swordsoul" monster or 1 "Fallen of Albaz"`.
 *
 * The family-vs-name decision below is made from the LAST quoted token, which
 * is correct for a single target but wrong here: nothing follows "Fallen of
 * Albaz", so the whole phrase reads as a list of card names and `"Swordsoul"`
 * becomes a literal name no card has. That half of the effect then resolves to
 * nothing and its edges vanish silently.
 *
 * Only `or` immediately followed by a quantity or a quoted name splits, which
 * is what keeps `Level 4 or lower` and `Level 8 or higher` intact — those are
 * the far more common use of the word in card text.
 */
const DISJUNCTION_RE =
  /\s+or\s+(?=(?:up to\s+|any number of\s+)?(?:\d+\s+|a\s+|an\s+)?\u0001Q\d+\u0001)/i;

/**
 * Push the final segment's noun back onto the segments that lack one.
 *
 * Disjunctions come in two shapes, and only one of them survives a naive split:
 *
 *   1 "Swordsoul" monster or 1 "Fallen of Albaz"   — distributed, splits fine
 *   1 "Photon" or "Galaxy" monster                 — ONE noun, shared by both
 *
 * Splitting the second shape strands `"Photon"` with no noun after it, so it
 * reads as a card name rather than an archetype — swapping one silent gap for
 * another. Copying the trailing `monster` onto it restores the reading the
 * printed text actually has.
 */
function distributeTrailingNoun(segments: string[]): string[] {
  const last = segments[segments.length - 1];
  const lastTokens = tokensIn(last);
  if (!lastTokens.length) return segments;

  const sharedNoun = last.slice(lastTokens[lastTokens.length - 1].end);
  if (!ARCHETYPE_NOUN_RE.test(sharedNoun)) return segments;

  return segments.map((segment, index) => {
    if (index === segments.length - 1) return segment;

    const tokens = tokensIn(segment);
    if (!tokens.length) return segment;

    const after = segment.slice(tokens[tokens.length - 1].end);
    return ARCHETYPE_NOUN_RE.test(after) ? segment : segment + sharedNoun;
  });
}

/**
 * Every target a noun phrase names.
 *
 * Usually one. A phrase offering a choice between a family and a specific card
 * yields two, because a single `EffectPredicate` cannot express "belongs to
 * archetype X OR is literally named Y" — and for a search graph, "what can
 * this card reach" makes the or/and distinction immaterial anyway: it can
 * reach either.
 *
 * A disjunction of plain card names (`"A" or "B"`) is merged back into one
 * `named` target, exactly as before, so the overwhelmingly common case is
 * byte-identical to the previous behaviour.
 */
export function parseTargets(
  rawNp: string,
  names: string[],
  ctx: ParserContext,
  inheritedExcept: string[] = [],
): ParsedTarget[] {
  const segments = rawNp.split(DISJUNCTION_RE);
  if (segments.length < 2) {
    return [parseTarget(rawNp, names, ctx, inheritedExcept)];
  }

  const parsed = distributeTrailingNoun(segments).map((segment) =>
    parseTarget(segment, names, ctx, inheritedExcept),
  );

  // Mixed shapes are the only reason to split. All-named collapses back.
  if (parsed.every((p) => p.target.kind === 'named')) {
    return [parseTarget(rawNp, names, ctx, inheritedExcept)];
  }

  // A segment that says nothing on its own ("1 card") would otherwise add a
  // junk target next to a good one.
  const useful = parsed.filter((p) => p.target.kind !== 'unresolved');
  return useful.length
    ? useful
    : [parseTarget(rawNp, names, ctx, inheritedExcept)];
}

/**
 * Resolve a target noun phrase.
 *
 * Returns an `unresolved` target rather than guessing whenever the phrase
 * cannot be pinned down — an omitted edge is a missing feature, a wrong edge
 * destroys trust in the whole graph.
 */
export function parseTarget(
  rawNp: string,
  names: string[],
  ctx: ParserContext,
  inheritedExcept: string[] = [],
): ParsedTarget {
  const quantity = parseQuantity(rawNp);

  // Pull `except "X"` off the end before anything else looks at the phrase.
  //
  // In real card text the exclusion usually sits AFTER the destination -
  // `add 1 Level 1 FIRE monster from your Deck to your hand, except "X"` - so
  // it falls outside the noun phrase entirely. The caller extracts it from the
  // full resolution segment and passes it in; this local match only catches the
  // rarer case where it sits inside the phrase.
  const exceptMatch = EXCEPT_RE.exec(rawNp);
  const np = (exceptMatch ? rawNp.slice(0, exceptMatch.index) : rawNp).trim();
  const localExcept = exceptMatch
    ? tokensIn(exceptMatch[1])
        .map((t) => names[t.index])
        .filter((n): n is string => n !== undefined)
    : [];
  const exceptNames = [...new Set([...inheritedExcept, ...localExcept])];

  const withExclusions = (predicate: EffectPredicate): EffectPredicate =>
    exceptNames.length
      ? { ...predicate, excludeNames: exceptNames }
      : predicate;

  // Trailing sentence punctuation would otherwise defeat the "this card"
  // match, silently dropping every self-targeting summon.
  const bare = np
    .replace(LEADING_NOISE_RE, '')
    .replace(/[.,;:]+$/, '')
    .trim();

  // --- "this card" ---------------------------------------------------------
  if (SELF_RE.test(bare)) {
    return { target: { kind: 'self' }, quantity, exceptNames };
  }

  const tokens = tokensIn(np);

  if (tokens.length) {
    const last = tokens[tokens.length - 1];
    const followedByNoun = ARCHETYPE_NOUN_RE.test(np.slice(last.end));
    const tokenNames = tokens
      .map((t) => names[t.index])
      .filter((n): n is string => n !== undefined);

    if (followedByNoun) {
      // `1 "Sky Striker Ace" monster` — a family, plus whatever else the
      // phrase constrains (level, attribute, ...).
      const quoted = names[last.index];
      const predicate = parsePredicate(np, ctx);

      if (quoted && ctx.archetypes.has(quoted)) {
        predicate.archetype = quoted;
      } else if (quoted) {
        // Unknown archetype (a newer set than the vocabulary): degrade to a
        // name match rather than dropping the edge entirely.
        predicate.nameContains = quoted;
      }

      return {
        target: {
          kind: 'criteria',
          predicate: withExclusions(predicate),
          label: unmaskBare(np, names),
        },
        quantity,
        exceptNames,
      };
    }

    if (tokenNames.length) {
      // `"A"`, or `"A" or "B"` — specific cards.
      const selfOnly =
        tokenNames.length === 1 && tokenNames[0] === ctx.cardName;
      return {
        target: selfOnly
          ? { kind: 'self' }
          : { kind: 'named', names: tokenNames },
        quantity,
        exceptNames,
      };
    }
  }

  // --- unquoted archetype --------------------------------------------------
  const predicate = parsePredicate(np, ctx);
  const bareArchetype = matchBareArchetype(np, ctx);
  if (bareArchetype) predicate.archetype = bareArchetype;

  if (isEmptyPredicate(predicate)) {
    // "1 card", "a card from the Deck" — matches the whole pool, so it says
    // nothing. This is the guard that keeps Ash Blossom's quoted bullets and
    // Pot of Duality's "add 1 of them" out of the graph.
    return {
      target: { kind: 'unresolved', text: unmaskBare(np, names) },
      quantity,
      exceptNames,
    };
  }

  return {
    target: {
      kind: 'criteria',
      predicate: withExclusions(predicate),
      label: unmaskBare(np, names),
    },
    quantity,
    exceptNames,
  };
}

/** True when a target is specific enough to draw a graph edge from. */
export function isResolvedTarget(target: EffectTarget): boolean {
  if (target.kind === 'unresolved') return false;
  if (target.kind === 'criteria') return !isEmptyPredicate(target.predicate);
  return true;
}
