/**
 * Stages 2 and 3 — protected tokenization and lexical analysis.
 *
 * The two stages collapse into one here, and that is the main benefit of using
 * a real lexer. The constructs that must be "protected" from generic
 * tokenization — quoted card names, parenthetical asides, block headers — are
 * simply token types with their own patterns, matched before anything else. So
 * `"Number 39: Utopia"` is ONE token and the colon inside it can never be
 * mistaken for PSCT's structural colon, and `"D.D. Crow"` cannot break sentence
 * splitting. No masking pass, and no mask-offset bookkeeping, because every
 * Chevrotain token already carries its own offsets.
 *
 * Token types are built from `lexicon.ts`, so the vocabulary stays data.
 */

import { createToken, Lexer, type IToken, type TokenType } from 'chevrotain';
import {
  compileLexicon,
  patternFor,
  TokenKind,
  LEXICON,
  type LexiconEntry,
} from './lexicon';
import { DiagnosticCode, DiagnosticSeverity } from './ast';
import type { Diagnostic, Span } from './ast';
import { toOriginalSpan, type NormalizedText } from './normalize';

/**
 * Cross-kind match order, highest priority first.
 *
 * Chevrotain picks the FIRST token type in this array that matches at the
 * current position — not the longest match overall. Intra-kind ordering is
 * handled by `compileLexicon` (longest phrase first), but conflicts BETWEEN
 * kinds have to be resolved here, by hand:
 *
 *  - `Comparator` precedes `Conjunction` so "or more" beats "or".
 *  - `Conjunction` precedes `ConditionMarker` so "after that" beats "After".
 *  - `ConditionMarker` precedes `Quantifier` so "Each time" beats "each".
 *
 * Those three constraints are why `Comparator` exists as a separate kind; see
 * the note in `lexicon.ts`. Most other apparent collisions are resolved by the
 * trailing `\b` in each pattern — "to" cannot match inside "toss", and "gain"
 * cannot match inside "gains" — so they impose no ordering requirement.
 */
const KIND_ORDER: readonly TokenKind[] = [
  TokenKind.FREQUENCY,
  TokenKind.YOU_CAN,
  TokenKind.COMPARATOR,
  TokenKind.DISJUNCTION,
  TokenKind.CONJUNCTION,
  TokenKind.CONDITION_MARKER,
  TokenKind.QUANTIFIER,
  TokenKind.TARGET_VERB,
  TokenKind.MODIFIER,
  TokenKind.VERB,
  TokenKind.STAT,
  TokenKind.ATTRIBUTE,
  TokenKind.POSITION,
  TokenKind.ZONE,
  TokenKind.OWNER,
  TokenKind.EXCEPT,
  TokenKind.REFERENCE,
  TokenKind.PREPOSITION,
];

/** Skipped, but the offsets of everything else still account for it. */
const Whitespace = createToken({
  name: 'Whitespace',
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
});

/**
 * Category for every token that can appear inside a noun phrase.
 *
 * A category turns "match any descriptor word" into a single `CONSUME`, rather
 * than an `OR` over fifteen alternatives that Chevrotain would have to check
 * for ambiguity on every iteration. It also means adding a descriptor kind to
 * the lexicon does not touch the grammar.
 *
 * Three kinds are deliberately NOT members:
 *
 *  - `Preposition`, because `prepPhrase` is what consumes it, and a noun phrase
 *    that could also swallow "from" would make the two indistinguishable.
 *  - `Conjunction`, because it separates clauses; absorbing it would merge an
 *    action with the next one and lose the dependency between them.
 *  - `Comma`, because "and if you do, destroy ..." puts a comma where the next
 *    action group begins. A comma inside the category makes that comma look
 *    like the start of a noun phrase, which turns the following action into a
 *    modifier clause.
 *
 * `Reference` is also excluded, so that "destroy it" resolves through
 * `references.ts` instead of being absorbed as an anonymous descriptor.
 */
export const NounPart = createToken({
  name: 'NounPart',
  pattern: Lexer.NA,
});

/** Lexicon kinds whose tokens are noun-phrase material. */
const NOUN_KINDS: readonly TokenKind[] = [
  TokenKind.QUANTIFIER,
  TokenKind.COMPARATOR,
  TokenKind.DISJUNCTION,
  TokenKind.ATTRIBUTE,
  TokenKind.POSITION,
  TokenKind.STAT,
  TokenKind.ZONE,
  TokenKind.OWNER,
  TokenKind.EXCEPT,
];

/**
 * A bracketed block header. Pendulum cards carry two independent effect bodies
 * separated by these; 374 cards in the pool use them and none uses a dashed
 * separator, so there is no dash rule to write.
 */
export const BlockHeader = createToken({
  name: 'BlockHeader',
  pattern: /\[\s*(?:Pendulum|Monster)\s+Effect\s*\]/i,
});

/**
 * A parenthetical aside, matched whole.
 *
 * Non-nesting on purpose: `[^()]*` rather than a recursive pattern. Card text
 * does not nest parentheses, and a greedy or recursive version would swallow
 * from the first "(" to the last ")" across a whole card — which in Tiki
 * Peace's text would eat a real Special Summon.
 */
export const Parenthetical = createToken({
  name: 'Parenthetical',
  pattern: /\([^()]*\)/,
  categories: [NounPart],
});

/**
 * A quoted card name or archetype, matched whole.
 *
 * This is the single most important token in the lexer. Card names contain
 * every character later stages key on: colons ("Number 39: Utopia"), periods
 * ("D.D. Crow"), zone words ("Deck Devastation Virus"), and archetype words
 * ("Elemental HERO Sunrise"). Matching the whole quoted run first makes that
 * entire class of false positive structurally impossible rather than something
 * each later rule has to defend against.
 */
export const QuotedName = createToken({
  name: 'QuotedName',
  pattern: /"[^"]*"/,
  categories: [NounPart],
});

export const Bullet = createToken({ name: 'Bullet', pattern: /●/ });

/**
 * A preserved line break.
 *
 * Deliberately NOT a `NounPart` and not skipped: `structure.ts` needs to see it
 * to tell a structural break (after an Extra Deck materials line) from a
 * cosmetic mid-sentence wrap. It is stripped from each sentence before the
 * grammar runs, so no rule ever has to mention it.
 */
export const LineBreak = createToken({ name: 'LineBreak', pattern: /\n+/ });

/** A bare integer. ATK/DEF/LP values and counts are all plain digits. */
export const NumberLiteral = createToken({
  name: 'NumberLiteral',
  pattern: /\d+/,
  categories: [NounPart],
});

export const Colon = createToken({ name: 'Colon', pattern: /:/ });
export const Semicolon = createToken({ name: 'Semicolon', pattern: /;/ });
export const Period = createToken({ name: 'Period', pattern: /\./ });
export const Comma = createToken({ name: 'Comma', pattern: /,/ });
export const Slash = createToken({
  name: 'Slash',
  pattern: /\//,
  categories: [NounPart],
});

/** Any run of letters that is not in the lexicon. */
export const Word = createToken({
  name: 'Word',
  pattern: /[A-Za-z][A-Za-z'’\-]*/,
  categories: [NounPart],
});

/**
 * Any other single non-space character.
 *
 * Exists so lexing never fails hard on an unexpected glyph: a stray "&", "+"
 * or "%" becomes one `Other` token and the parse continues with a diagnostic,
 * rather than the whole card erroring out. An unparsed glyph is a missing
 * fact; a failed card is a missing card.
 */
export const Other = createToken({
  name: 'Other',
  pattern: /[^\s]/,
  categories: [NounPart],
});

/** TokenType per lexicon kind, built once at module load. */
const kindTokens = new Map<TokenKind, TokenType>();

/**
 * Build one TokenType per kind, whose pattern is an alternation of that kind's
 * phrases in longest-first order.
 *
 * One token type per kind (rather than per phrase) keeps the grammar written
 * against stable categories: the parser matches `Verb`, and the visitor reads
 * the matched `image` through the lexicon's `semanticHint` to get the enum
 * value. Adding a verb therefore never touches the grammar.
 */
function buildKindTokens(entries: readonly LexiconEntry[]): void {
  const byKind = new Map<TokenKind, LexiconEntry[]>();
  for (const entry of compileLexicon(entries)) {
    const list = byKind.get(entry.tokenType) ?? [];
    list.push(entry);
    byKind.set(entry.tokenType, list);
  }

  for (const [kind, list] of byKind) {
    const alternation = list.map((entry) => patternFor(entry).source).join('|');
    kindTokens.set(
      kind,
      createToken({
        name: kind,
        pattern: new RegExp(alternation, 'i'),
        ...(NOUN_KINDS.includes(kind) ? { categories: [NounPart] } : {}),
        // Every lexicon phrase could also be lexed as a plain Word; telling
        // Chevrotain so lets it keep the longest match when a phrase is a
        // strict prefix of a longer word that is NOT in the lexicon.
        longer_alt: Word,
      }),
    );
  }
}

buildKindTokens(LEXICON);

/** Look up the TokenType for a lexicon kind. Throws only on a typo. */
export function tokenFor(kind: TokenKind): TokenType {
  const token = kindTokens.get(kind);
  if (!token) throw new Error(`No token type built for kind "${kind}"`);
  return token;
}

/**
 * The full token list, in match order.
 *
 * Protected constructs first (block headers, parentheticals, quoted names),
 * then numbers, then the lexicon kinds in `KIND_ORDER`, then punctuation, and
 * finally the two catch-alls. `Word` must come after every lexicon kind or it
 * would shadow all of them; `Other` must come last of all.
 */
export const ALL_TOKENS: TokenType[] = [
  Whitespace,
  LineBreak,
  BlockHeader,
  Parenthetical,
  QuotedName,
  Bullet,
  NumberLiteral,
  ...KIND_ORDER.map(tokenFor),
  Colon,
  Semicolon,
  Period,
  Comma,
  Slash,
  Word,
  Other,
];

/**
 * The vocabulary the PARSER is built against.
 *
 * Identical to `ALL_TOKENS` plus the `NounPart` category. Chevrotain requires
 * every token type a grammar rule references to be present in the parser's
 * vocabulary, and a category is referenced by `CONSUME(NounPart)` even though
 * it never matches text itself. It is kept out of the lexer's own list, where a
 * `Lexer.NA` pattern has nothing to match.
 */
export const PARSER_TOKENS: TokenType[] = [...ALL_TOKENS, NounPart];

export const psctLexer = new Lexer(ALL_TOKENS, {
  // Offsets are the whole point of using a lexer here; keep them. Line and
  // column would cost extra bookkeeping for information no stage uses, since
  // effect text is a single logical line once normalized.
  positionTracking: 'onlyOffset',
  ensureOptimizations: false,
});

/**
 * Half-open end offset of a token, in normalized-text space.
 *
 * Derived from the image rather than read from `token.endOffset`, which this
 * chevrotain version leaves undefined under `positionTracking: 'onlyOffset'`.
 * The image is the exact matched text, so this is always correct — and it
 * keeps every span in the parser independent of the lexer's position config.
 */
export function tokenEnd(token: IToken): number {
  return token.startOffset + token.image.length;
}

/** The original-text span of a single token. */
export function spanOfToken(nt: NormalizedText, token: IToken): Span {
  return toOriginalSpan(nt, token.startOffset, tokenEnd(token));
}

/**
 * The original-text span covering a run of tokens.
 *
 * Used for every composite node — an action spans its verb through its last
 * qualifier — so the span a consumer highlights is the whole clause, not just
 * the keyword that triggered the match.
 */
export function spanOfTokens(nt: NormalizedText, tokens: IToken[]): Span {
  if (tokens.length === 0) return { start: 0, end: 0, text: '' };
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  return toOriginalSpan(nt, first.startOffset, tokenEnd(last));
}

export interface LexResult {
  tokens: IToken[];
  diagnostics: Diagnostic[];
}

/** Punctuation that legitimately appears as an `Other` token. */
const BENIGN_OTHER = new Set(['&', '+', '(', ')', '"', '%', '-', '*', '#']);

/**
 * Lex normalized card text.
 *
 * Lexing never throws. Anything unrecognised becomes a diagnostic so the
 * review queue can see it, which is the whole contract: never let an
 * unsupported glyph silently change the interpretation.
 */
export function lex(nt: NormalizedText): LexResult {
  const result = psctLexer.tokenize(nt.normalized);
  const diagnostics: Diagnostic[] = [];

  for (const error of result.errors) {
    const start = error.offset ?? 0;
    diagnostics.push({
      severity: DiagnosticSeverity.WARNING,
      code: DiagnosticCode.LEXER_UNKNOWN_TOKEN,
      message: error.message,
      span: toOriginalSpan(nt, start, start + (error.length ?? 1)),
    });
  }

  for (const token of result.tokens) {
    if (token.tokenType !== Other) continue;
    if (BENIGN_OTHER.has(token.image)) continue;
    diagnostics.push({
      severity: DiagnosticSeverity.INFO,
      code: DiagnosticCode.LEXER_UNKNOWN_TOKEN,
      message: `Unrecognised character ${JSON.stringify(token.image)}.`,
      span: spanOfToken(nt, token),
    });
  }

  return { tokens: result.tokens, diagnostics };
}

/** The semantic hint for a matched token, or undefined for Word/Other. */
export function hintOf(token: IToken): string | undefined {
  const normalizedPhrase = token.image.toLowerCase().replace(/\s+/g, ' ');
  return HINT_LOOKUP.get(normalizedPhrase);
}

/**
 * Hints keyed by the matched image rather than by the authored phrase, so a
 * phrase whose internal whitespace differed in print still resolves.
 */
const HINT_LOOKUP: ReadonlyMap<string, string> = new Map(
  LEXICON.filter((e) => e.semanticHint).map((e) => [
    e.phrase.toLowerCase().replace(/\s+/g, ' '),
    e.semanticHint as string,
  ]),
);
