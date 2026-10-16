/**
 * Report PSCT parser coverage over the live card pool.
 *
 * Writes nothing. Its job is to answer "did that grammar change help", which is
 * not a question `yarn test` can answer: the corpus is 31 hand-picked cards and
 * the pool is 14k, so a rule that fixes the corpus can still lose ground
 * overall.
 *
 * The failure-shape histogram is the useful part. Diagnostics say WHICH cards
 * are unparsed; grouping them by the token that stopped the parse says which
 * single grammar rule would buy the most coverage.
 *
 * Usage:
 *   yarn psct:metrics                # whole pool
 *   yarn psct:metrics --limit=500    # a sample
 *   yarn psct:metrics --show=20      # more example failures per shape
 *   yarn psct:metrics --dump-other   # raw messages the classifier could not
 *                                    # label (deduped, top 30). Off by default;
 *                                    # use it when `other` grows, then add a
 *                                    # regex + label to `classify`.
 *   yarn psct:metrics --why-modifier # for the "expected Modifier" family, re-derive
 *                                    # the failing clause's TEXT from the parser's
 *                                    # own stages and classify it by probable cause
 *                                    # (missing verb, passive, modal, list
 *                                    # continuation, flavour...). Off by default; it
 *                                    # re-runs the structure stages per card.
 */

import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/client';
import { createPrismaAdapter } from '../prisma-adapter.factory';
import { parseCard } from '../../src/psct-parser';
import { DiagnosticCode } from '../../src/psct-parser/ast';
import type { ParsedCard, ParserContext } from '../../src/psct-parser/ast';
import { summarize } from '../../src/psct-parser/metrics';
import { normalize } from '../../src/psct-parser/normalize';
import {
  LineBreak,
  Period,
  lex,
  spanOfTokens,
} from '../../src/psct-parser/lexer';
import { parseTokens } from '../../src/psct-parser/grammar';
import {
  imagesOf,
  splitBlocks,
  splitClause,
  splitSentences,
} from '../../src/psct-parser/structure';
import {
  isNotAnEffect,
  readRestrictions,
} from '../../src/psct-parser/restrictions';
import type { IToken } from 'chevrotain';
import { LEXICON } from '../../src/psct-parser/lexicon';

/** The token a grammar error tripped on, which names the missing rule. */
const EXPECTING_RE =
  /Expecting(?: token of type)?[^>]*-->\s*(.+?)\s*<--.*?found\s*-->\s*(.+?)\s*<--/s;

/**
 * Leftover input after a clause parsed.
 *
 * A different failure mode from the above and worth separating: the clause DID
 * parse and produced an AST, but trailing tokens were not consumed. These cost
 * a trailing qualifier, not a whole effect.
 */
const REDUNDANT_RE = /Redundant input[\s\S]*?found:\s*([\s\S]+?)\s*$/;

/**
 * Chevrotain's multi-alternative form, used by OR: "Expecting: one of these
 * possible Token sequences:\n  1. [A]\n  2. [B]\nbut found: 'x'". Means no
 * alternative could start with the token found.
 */
const NO_VIABLE_ALT_RE =
  /Expecting: one of these possible Token sequences:?\s*((?:\s*\d+\.\s*\[[^\]]*\])+)\s*but found:\s*'([\s\S]*?)'\s*$/;

/**
 * Chevrotain's MANY / AT_LEAST_ONE form: "Expecting: expecting at least one
 * iteration which starts with one of these possible Token sequences::\n
 * <[NounPart]>\nbut found: 'x'". The loop needed one item and got none.
 */
const AT_LEAST_ONE_RE =
  /expecting at least one iteration which starts with one of these possible Token sequences:+\s*([\s\S]*?)\s*but found:\s*'([\s\S]*?)'\s*$/;

/** Leading "Resolution clause: " style prefix added by the parser. */
const CLAUSE_PREFIX_RE = /^([A-Za-z ]+? clause):\s/;

const short = (text: string, max = 40) =>
  JSON.stringify(text.replace(/\s+/g, ' ').trim().slice(0, max));

/** Collapse a Chevrotain "<[A]> <[B]>" / "1. [A]\n 2. [B]" list to "A|B". */
const tokenNames = (list: string) =>
  [...list.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]).join('|');

/** Map one GRAMMAR_PARSE_ERROR message to a histogram label. */
function classify(message: string): string {
  const clause = CLAUSE_PREFIX_RE.exec(message)?.[1];
  const where = clause ? `${clause.split(' ')[0].toLowerCase()}: ` : '';

  const expecting = EXPECTING_RE.exec(message);
  if (expecting) {
    return `${where}expected ${expecting[1]}, found ${short(expecting[2])}`;
  }
  const redundant = REDUNDANT_RE.exec(message);
  if (redundant) return `${where}trailing input: ${short(redundant[1])}`;

  const atLeastOne = AT_LEAST_ONE_RE.exec(message);
  if (atLeastOne) {
    return `${where}at-least-one failed, expected [${tokenNames(atLeastOne[1])}], found ${short(atLeastOne[2])}`;
  }
  const noViable = NO_VIABLE_ALT_RE.exec(message);
  if (noViable) {
    return `${where}expected one of [${tokenNames(noViable[1])}], found ${short(noViable[2])}`;
  }
  return 'other';
}

/** One clause that died with "expected Modifier", recovered from its tokens. */
interface FailedClause {
  card: string;
  /** Non-effect Monsters print flavour text in the description field. */
  flavour: boolean;
  part: 'activation' | 'resolution';
  /** Tokens of the failing action group, up to (not including) the fail point. */
  pre: string[];
  /** Lexer token-type names for `pre`, parallel to it. */
  preTypes: string[];
  /** From the fail point to the next separator (or end of clause). */
  post: string[];
  postTypes: string[];
  /** The clause part's text before this group starts ('' when it starts it). */
  before: string;
  /** Chevrotain's found token: image, or '<end>' at end of input. */
  found: string;
}

const SEPARATORS = new Set(['Comma', 'Conjunction', 'Semicolon']);

/**
 * Re-derive the clause boundaries for one card and return every action group
 * that failed with "expected Modifier".
 *
 * The diagnostic cannot be trusted for this: at end of input its span is empty,
 * so `span.text` is ''. Instead the pipeline's own stages are replayed and the
 * failing group is rebuilt from tokens. The fail point is the error token's
 * position in the clause array (end of array for EOF); the group starts after
 * the last separator before it, because `actionSequence` only starts a new
 * group after a comma or conjunction.
 */
function failedModifierClauses(
  description: string,
  ctx: ParserContext,
  flavour: boolean,
): FailedClause[] {
  const out: FailedClause[] = [];
  const nt = normalize(description);
  const { tokens } = lex(nt);

  for (const block of splitBlocks(tokens)) {
    if (block.quotedEffects) continue;
    for (const sentence of splitSentences(block.tokens)) {
      const text = imagesOf(sentence);
      if (isNotAnEffect(text)) continue;
      const stated = readRestrictions(
        text,
        spanOfTokens(nt, sentence),
        ctx.cardName,
      );
      // parseSentence skips the grammar for Summon conditions.
      if (stated.summonConditions.length) continue;

      const parts = splitClause(sentence);
      const strip = (ts: IToken[]) =>
        ts.filter((t) => t.tokenType !== Period && t.tokenType !== LineBreak);

      const runs: ['activation' | 'resolution', IToken[]][] = [
        ['activation', strip(parts.activation)],
        ['resolution', strip(parts.resolution)],
      ];
      for (const [part, clause] of runs) {
        if (!clause.length) continue;
        const attempt = parseTokens(
          clause,
          part === 'activation' ? 'activationClause' : 'resolutionClause',
        );
        for (const error of attempt.errors) {
          if (!/Expecting[^>]*-->\s*Modifier\s*<--/.test(error.message)) {
            continue;
          }
          const at = error.token ? clause.indexOf(error.token) : -1;
          const failIdx = at < 0 ? clause.length : at;
          let start = failIdx;
          while (
            start > 0 &&
            !SEPARATORS.has(clause[start - 1].tokenType.name)
          ) {
            start--;
          }
          let end = failIdx;
          while (
            end < clause.length &&
            !SEPARATORS.has(clause[end].tokenType.name)
          ) {
            end++;
          }
          // A failure AT a separator leaves the post-group empty.
          const pre = clause.slice(start, failIdx);
          const post = clause.slice(failIdx, Math.max(end, failIdx));
          out.push({
            card: ctx.cardName,
            flavour,
            part,
            pre: pre.map((t) => t.image),
            preTypes: pre.map((t) => t.tokenType.name),
            post: post.map((t) => t.image),
            postTypes: post.map((t) => t.tokenType.name),
            before: imagesOf(clause.slice(0, start)),
            found: at < 0 ? '<end>' : clause[failIdx].image,
          });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// --why-modifier: classify the clauses behind "expected Modifier"
// ---------------------------------------------------------------------------

/** Words of single- and multi-word lexicon verbs, minus adjectives. */
const VERB_WORDS = new Set(
  LEXICON.filter((e) => e.tokenType === 'Verb' || e.tokenType === 'TargetVerb')
    .flatMap((e) => e.phrase.toLowerCase().split(/\s+/))
    .filter(
      (w) =>
        ![
          'the',
          'end',
          'battle',
          'phase',
          'special',
          'normal',
          'ritual',
          'fusion',
          'synchro',
          'xyz',
          'link',
        ].includes(w),
    ),
);

/** The lexicon verb a plain Word is an inflection of ("draws" -> "draw"). */
function inflectionOf(word: string): string | undefined {
  const w = word.toLowerCase();
  const c: string[] = [];
  if (w.endsWith('ies') || w.endsWith('ied')) c.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) c.push(w.slice(0, -2));
  if (w.endsWith('s')) c.push(w.slice(0, -1));
  if (w.endsWith('ed')) {
    c.push(w.slice(0, -2), w.slice(0, -1));
    if (/(.)\1ed$/.test(w)) c.push(w.slice(0, -3));
  }
  if (w.endsWith('ing')) c.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  return c.find((x) => VERB_WORDS.has(x));
}

const BE_RE = /^(is|are|was|were|be|been|being)$/i;
const PARTICIPLE_RE =
  /^(\w+ed|sent|set|drawn|put|returned|shuffled|chosen|taken|given|unaffected|kept|left|made|done|stolen|lost|won|used|held|flipped)$/i;
const MODAL_RE =
  /^(can|could|must|may|will|would|should|does|do|has|have|had|cannot|can't|also|always)$/i;
const FUNCTION_WORDS = new Set(
  'the a an this that those these its their your his her our each all any both one other another only also if when for until during after before in on at to of from by with without and or but then so as than while whenever once not no it they you we he she them there here such same'.split(
    ' ',
  ),
);
const DETERMINERS = new Set(
  'a an the this that its your their each any another'.split(' '),
);
const SCOPE_RE =
  /^(this turn|for the rest|until|otherwise|immediately|during|after|in response|once|the next time|the first time|next time|at the|when|if)\b/i;
const OBJECT_STARTERS = new Set([
  'NumberLiteral',
  'Reference',
  'Quantifier',
  'Owner',
  'Stat',
  'QuotedName',
]);

interface Cause {
  /** Stable category key; the order of CAUSES is the report order. */
  key: string;
  /** Free-form sub-label for a per-category phrasing histogram. */
  detail?: string;
}

/** Category key -> [label, one-line fix]. */
const CAUSES: Record<string, [string, string]> = {
  flavour: [
    'flavour text of a non-effect Monster',
    'nothing: not an effect. Skip cards with isEffect=false (and quote-wrapped text) before parsing.',
  ],
  paren: [
    'reminder text / parenthetical glued to the next sentence',
    'structure/lexer: parenthetical with nested "(s)" or a trailing sentence is not one token; split it off (or strip reminders) before the grammar.',
  ],
  materials: [
    'materials line fused with the effect sentence',
    'structure: isMaterialsLine does not fire (no "+"); split a leading "N Level X monsters" run from the effect.',
  ],
  verb_noun: [
    'Verb lexeme used as a NOUN ("a Synchro Summon", "your Normal Summon")',
    'grammar/lexer: let a determiner/owner + Summon-verb act as noun material (NounPart), or lex it as noun after a determiner.',
  ],
  passive: [
    'passive / participle construction (is destroyed, must be Special Summoned, ...)',
    'grammar rule + lexicon: stative "be + participle" modifier clause; Special Summon cannot match "Special Summoned" (trailing \\b).',
  ],
  modal_verb: [
    'subject + modal ("can", "can only", "neither player can") + a lexed Verb',
    'grammar rule: subject? Modal actionClause (or a "can"/"can only"/"can also" lexicon entry before the Verb).',
  ],
  modal_word: [
    'modal / stative phrase followed by an unlisted word (can make a second attack, can attack ...)',
    'lexicon: add the specific Modifier phrases (see phrasing list).',
  ],
  modal_end: [
    'bare trailing modal',
    'grammar: modal with no complement (rare).',
  ],
  inflected: [
    'inflection of a lexicon verb that is not itself in the lexicon (draws, discards, takes, Summoned)',
    'lexicon: add the 3rd-person / participle forms AND a subject-led actionClause.',
  ],
  subj_word: [
    'subject + unlisted verb word ("you take ...", "both players take ...")',
    'lexicon: add the verb (see head words) and a subject-led actionClause.',
  ],
  subj_verb: [
    'explicit subject ("your opponent", "both players") + a lexed Verb',
    'grammar rule: Subject actionClause (the verb IS known; only the subject blocks it).',
  ],
  verb_inside: [
    'lexed Verb after noun material ("send both it and ...", "Negate any ... that target")',
    'grammar: correlative "both X and Y" / relative clause must not restart an actionGroup.',
  ],
  verbhead: [
    'missing VERB: imperative head word absent from the lexicon',
    'lexicon: add the verb entries (see top head words).',
  ],
  tail_prep: [
    'orphan prepositional / except / "equal to" tail after a separator',
    'grammar: let qualifiers/prepPhrase continue after a comma/"and" instead of starting a new actionGroup.',
  ],
  list_cont: [
    'noun-phrase continuation after a separator (A and B, A, B, and C)',
    'grammar: an actionGroup that is noun-only after a Comma/Conjunction should extend the previous object (coordination).',
  ],
  lead: [
    'scope / duration / ordering lead-in ("this turn,", "Otherwise,", "Immediately after ...")',
    'structure/grammar: peel the leading adverbial off like a condition (or a Lead rule) before the action.',
  ],
  fragment: [
    'verb-less noun-phrase fragment (no predicate at all)',
    'nothing in the lexicon; usually upstream splitting (materials / quoted lists). Inspect examples.',
  ],
  dangling: [
    'separator with nothing before the failure',
    'grammar: tolerate a leading Comma/Conjunction.',
  ],
};

function causeOf(x: FailedClause): Cause {
  const all = [...x.pre, ...x.post];
  const types = [...x.preTypes, ...x.postTypes];
  const text = all.join(' ').toLowerCase();
  const lastPre = x.pre[x.pre.length - 1];
  const lastPreType = x.preTypes[x.preTypes.length - 1];

  if (x.flavour) return { key: 'flavour' };
  if (x.preTypes[0] === 'Other' && x.pre[0] === "'") return { key: 'flavour' };
  if (x.pre.length === 0) return { key: 'dangling' };
  if (
    /^\(/.test(x.pre[0]) ||
    (x.preTypes[0] === 'Parenthetical' && all.length === 1)
  ) {
    return { key: 'paren' };
  }
  const youCanAt = types.indexOf('YouCan');
  if (
    youCanAt > 0 &&
    ['NumberLiteral', 'QuotedName'].includes(types[0]) &&
    !types
      .slice(0, youCanAt)
      .some(
        (t) => t === 'Word' && /^(is|are|can)$/i.test(all[types.indexOf(t)]),
      )
  ) {
    return { key: 'materials' };
  }
  if (
    x.postTypes[0] === 'Verb' &&
    (DETERMINERS.has(lastPre.toLowerCase()) || lastPreType === 'Owner')
  ) {
    return { key: 'verb_noun', detail: x.post[0].toLowerCase() };
  }
  for (let i = 0; i < all.length - 1; i++) {
    if (types[i] !== 'Word' || !BE_RE.test(all[i])) continue;
    let j = i + 1;
    while (j < all.length && /^(also|not|then|always|still)$/i.test(all[j]))
      j++;
    if (j < all.length && PARTICIPLE_RE.test(all[j])) {
      return {
        key: 'passive',
        detail: `${all[i].toLowerCase()} ${all[j].toLowerCase()}`,
      };
    }
  }
  if (/\bsummoned\b/.test(text)) {
    return { key: 'passive', detail: '(no be-form) ... Summoned' };
  }
  if (/^unaffected$/i.test(all[0])) {
    return { key: 'passive', detail: 'Unaffected by ...' };
  }
  for (let i = 0; i < all.length; i++) {
    const isModal =
      (types[i] === 'Word' && MODAL_RE.test(all[i])) || types[i] === 'YouCan';
    if (!isModal) continue;
    let j = i + 1;
    while (j < all.length && /^(only|also|not|then)$/i.test(all[j])) j++;
    if (types[j] === 'Verb' || types[j] === 'TargetVerb') {
      return {
        key: 'modal_verb',
        detail: all
          .slice(i, j + 1)
          .join(' ')
          .toLowerCase(),
      };
    }
    if (j >= all.length) {
      return { key: 'modal_end', detail: all.slice(i).join(' ').toLowerCase() };
    }
    return {
      key: 'modal_word',
      detail: all
        .slice(i, i + 4)
        .join(' ')
        .toLowerCase(),
    };
  }
  for (let i = 0; i < all.length; i++) {
    if (types[i] !== 'Word' || FUNCTION_WORDS.has(all[i].toLowerCase()))
      continue;
    const verb = inflectionOf(all[i]);
    if (verb) {
      return {
        key: 'inflected',
        detail: `${all[i].toLowerCase()} (< ${verb})`,
      };
    }
  }
  if (x.postTypes[0] === 'Verb' || x.postTypes[0] === 'TargetVerb') {
    return { key: 'subj_verb', detail: x.pre.join(' ').toLowerCase() };
  }
  if (
    x.postTypes[0] === 'Word' &&
    !FUNCTION_WORDS.has(x.post[0].toLowerCase()) &&
    /^[a-z]/.test(x.post[0]) &&
    x.postTypes[1] !== undefined
  ) {
    return { key: 'subj_word', detail: x.post[0].toLowerCase() };
  }
  if (types.includes('Verb') || types.includes('TargetVerb')) {
    return { key: 'verb_inside' };
  }
  // The head is an unlisted imperative when an OBJECT follows it directly.
  const next = types[1];
  const nextWord = all[1]?.toLowerCase();
  if (
    types[0] === 'Word' &&
    !FUNCTION_WORDS.has(all[0].toLowerCase()) &&
    all.length > 1 &&
    (OBJECT_STARTERS.has(next) ||
      (next === 'Word' && FUNCTION_WORDS.has(nextWord))) &&
    !/(s|ing|ed)$/i.test(all[0])
  ) {
    return { key: 'verbhead', detail: all[0].toLowerCase() };
  }
  if (x.before) {
    if (
      x.preTypes[0] === 'Preposition' ||
      x.preTypes[0] === 'Except' ||
      /^(equal|including|whose|with|using|depending)\b/i.test(x.pre[0])
    ) {
      return { key: 'tail_prep', detail: x.pre[0].toLowerCase() };
    }
    return { key: 'list_cont' };
  }
  if (SCOPE_RE.test(x.pre.join(' ')) || x.preTypes[0] === 'Preposition') {
    return { key: 'lead', detail: x.pre.slice(0, 3).join(' ').toLowerCase() };
  }
  return { key: 'fragment' };
}

function renderClause(x: FailedClause, max = 100): string {
  const join = (ts: string[]) =>
    ts
      .join(' ')
      .replace(/\s+([.,;:)])/g, '$1')
      .replace(/\(\s+/g, '(');
  const text = `${join(x.pre)} ⟂ ${join(x.post) || `[${x.found}]`}`;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function topCounts(
  items: (string | undefined)[],
  n: number,
): [string, number][] {
  const m = new Map<string, number>();
  for (const i of items) if (i) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function printWhyModifier(
  failed: FailedClause[],
  family: number,
  familyInEffects: number,
): void {
  const byCause = new Map<string, { x: FailedClause; c: Cause }[]>();
  for (const x of failed) {
    const c = causeOf(x);
    const list = byCause.get(c.key) ?? [];
    list.push({ x, c });
    byCause.set(c.key, list);
  }

  console.log('\n--- why "expected Modifier"? (re-derived clause text) ---');
  console.log(
    `  recovered ${failed.length} failing clauses; "expected Modifier" diagnostics: ${family}` +
      ` (${familyInEffects} on effects, which the shape histogram reads; ${family - familyInEffects} on the card, from sentences that produced no effect and are NOT in the histogram)`,
  );
  console.log(
    '  clause text is rendered "<tokens before the failure> ⟂ <rest of the group>"\n',
  );

  const ranked = [...byCause.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [key, rows] of ranked) {
    const [label, fix] = CAUSES[key];
    console.log(
      `  ${rows.length.toString().padStart(6)}  ${label}  [${new Set(rows.map((r) => r.x.card)).size} cards]`,
    );
    console.log(`          fix: ${fix}`);
    const seen = new Set<string>();
    for (const { x } of rows) {
      if (seen.has(x.card)) continue;
      seen.add(x.card);
      console.log(`          e.g. ${x.card}: ${renderClause(x)}`);
      if (seen.size === 3) break;
    }
    const detailTop =
      key === 'verbhead' || key === 'subj_word'
        ? 0
        : [
              'modal_word',
              'passive',
              'inflected',
              'modal_verb',
              'tail_prep',
              'lead',
              'verb_noun',
            ].includes(key)
          ? 20
          : 0;
    if (detailTop) {
      console.log(`          top phrasings:`);
      for (const [d, n] of topCounts(
        rows.map((r) => r.c.detail),
        detailTop,
      )) {
        console.log(`            ${n.toString().padStart(5)}  ${d}`);
      }
    }
    console.log('');
  }

  const heads = [
    ...(byCause.get('verbhead') ?? []),
    ...(byCause.get('subj_word') ?? []),
  ];
  console.log(
    '  top 30 head words missing from the lexicon (imperative + subject-led):',
  );
  for (const [w, n] of topCounts(
    heads.map((r) => r.c.detail),
    30,
  )) {
    console.log(`    ${n.toString().padStart(5)}  ${w}`);
  }

  // Does "Special Summon" fail to match "Special Summoned"? Check the lexed
  // type of every "Summoned" token rather than assuming.
  let summonedWord = 0;
  let summonedOther = 0;
  let summonedClauses = 0;
  for (const x of failed) {
    const types = [...x.preTypes, ...x.postTypes];
    const imgs = [...x.pre, ...x.post];
    let any = false;
    imgs.forEach((img, i) => {
      if (!/^summoned$/i.test(img)) return;
      any = true;
      if (types[i] === 'Word') summonedWord++;
      else summonedOther++;
    });
    if (any) summonedClauses++;
  }
  console.log(
    `\n  "Summoned" check: ${summonedClauses} failing clauses contain it; ` +
      `${summonedWord} tokens lexed as plain Word, ${summonedOther} as another type ` +
      '(Word means the lexicon Summon entries did not match the participle).',
  );
}

function parseArgs(argv: string[]) {
  const num = (flag: string) => {
    const arg = argv.find((a) => a.startsWith(`${flag}=`));
    return arg ? Number(arg.split('=')[1]) : undefined;
  };
  return {
    limit: num('--limit'),
    show: num('--show') ?? 5,
    dumpOther: argv.includes('--dump-other'),
    whyModifier: argv.includes('--why-modifier'),
  };
}

async function main(): Promise<void> {
  const { limit, show, dumpOther, whyModifier } = parseArgs(
    process.argv.slice(2),
  );
  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

  try {
    const [archetypeRows, raceRows] = await Promise.all([
      prisma.card.findMany({
        where: { archetype: { not: null } },
        select: { archetype: true },
        distinct: ['archetype'],
      }),
      prisma.card.findMany({
        where: { cardType: 'MONSTER', race: { not: null } },
        select: { race: true },
        distinct: ['race'],
      }),
    ]);

    const archetypes = new Set(
      archetypeRows.map((r) => r.archetype).filter((a): a is string => !!a),
    );
    const races = new Set(
      raceRows
        .map((r) => r.race)
        .filter((r): r is string => !!r && r.length > 0),
    );

    const cards = await prisma.card.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        cardType: true,
        spellTrapSubType: true,
        isEffect: true,
      },
      orderBy: { id: 'asc' },
      ...(limit ? { take: limit } : {}),
    });

    const parses: ParsedCard[] = [];
    /** Raw messages no regex classified (only collected with --dump-other). */
    const otherMessages = new Map<string, number>();
    /** Failure shape -> example cards. */
    const shapes = new Map<string, { count: number; examples: string[] }>();

    const failedClauses: FailedClause[] = [];
    /** "expected Modifier" diagnostics, card-level + effect-level (cross-check). */
    let familyDiagnostics = 0;
    let familyInEffects = 0;

    for (const card of cards) {
      const ctx: ParserContext = {
        archetypes,
        races,
        cardId: String(card.id),
        cardName: card.name,
        cardType: card.cardType,
        ...(card.spellTrapSubType
          ? { spellTrapSubType: card.spellTrapSubType }
          : {}),
      };

      const parsed = parseCard(card.description, ctx);
      parses.push(parsed);

      if (whyModifier) {
        // A sentence that yields no effect carries its diagnostics on the CARD,
        // which the shape histogram below never reads. Count both for the
        // cross-check.
        for (const d of parsed.diagnostics) {
          if (
            d.code === DiagnosticCode.GRAMMAR_PARSE_ERROR &&
            /expected Modifier/.test(classify(d.message))
          ) {
            familyDiagnostics++;
          }
        }
        for (const e of parsed.effects) {
          for (const d of e.diagnostics) {
            if (
              d.code === DiagnosticCode.GRAMMAR_PARSE_ERROR &&
              /expected Modifier/.test(classify(d.message))
            ) {
              familyDiagnostics++;
              familyInEffects++;
            }
          }
        }
        failedClauses.push(
          ...failedModifierClauses(
            card.description,
            ctx,
            !card.isEffect && card.cardType === 'MONSTER',
          ),
        );
      }

      for (const effect of parsed.effects) {
        for (const diagnostic of effect.diagnostics) {
          if (diagnostic.code !== DiagnosticCode.GRAMMAR_PARSE_ERROR) continue;
          const shape = classify(diagnostic.message);
          if (dumpOther && shape === 'other') {
            otherMessages.set(
              diagnostic.message,
              (otherMessages.get(diagnostic.message) ?? 0) + 1,
            );
          }
          const entry = shapes.get(shape) ?? { count: 0, examples: [] };
          entry.count++;
          if (entry.examples.length < show) {
            entry.examples.push(
              `${card.name}: ${effect.sourceText.slice(0, 110)}`,
            );
          }
          shapes.set(shape, entry);
        }
      }
    }

    if (dumpOther) {
      console.log('--- raw unclassified messages (deduped, by frequency) ---');
      const top = [...otherMessages.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);
      for (const [message, count] of top) {
        console.log(`\n[${count}x] ${JSON.stringify(message)}`);
      }
      console.log(`\n(${otherMessages.size} distinct raw messages)\n`);
    }

    if (whyModifier) {
      printWhyModifier(failedClauses, familyDiagnostics, familyInEffects);
    }

    const metrics = summarize(parses);

    console.log(
      `PSCT parser v${metrics.parserVersion} over ${metrics.total} cards\n`,
    );
    console.log(`  clean             ${metrics.parsedWithoutErrors}`);
    console.log(`  with warnings     ${metrics.parsedWithWarnings}`);
    console.log(`  failed            ${metrics.failed}`);
    console.log(`  avg confidence    ${metrics.averageConfidence}`);
    console.log(
      `  resolved actions  ${metrics.resolvedActionRate}` +
        ` (${metrics.actionsResolved}/${metrics.actionsTotal})\n`,
    );

    console.log('  diagnostics by code:');
    for (const [code, count] of Object.entries(metrics.diagnosticCounts).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`    ${count.toString().padStart(6)}  ${code}`);
    }

    console.log('\n  top unparsed shapes (each names a missing grammar rule):');
    const ranked = [...shapes.entries()].sort(
      (a, b) => b[1].count - a[1].count,
    );
    for (const [shape, { count, examples }] of ranked.slice(0, 15)) {
      console.log(`\n    ${count.toString().padStart(6)}  ${shape}`);
      for (const example of examples) console.log(`            ${example}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
