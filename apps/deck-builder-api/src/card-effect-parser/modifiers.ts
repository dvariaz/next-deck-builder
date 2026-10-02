import {
  EffectStat,
  ModifierKind,
  type EffectModifier,
  type EffectTarget,
  type ParserContext,
} from './card-effect.types';
import { unmaskBare } from './normalize';
import { parseTarget } from './target';

/**
 * Stage 9 — continuous modifiers.
 *
 * A continuous effect applies a STATE rather than performing an action: "gains
 * 500 ATK", "cannot be destroyed by battle", "is unaffected by card effects".
 * There is no moment at which these happen, so forcing them through
 * `EffectAction` would mean inventing a source zone and a destination for
 * things that move no cards.
 *
 * These are also the effects a search-oriented parser misses completely: none
 * of their verbs ("gains", "becomes", "is unaffected") appear in stage 6's verb
 * table, so before this stage existed the whole sentence produced nothing and
 * was dropped — roughly 13,000 segments across the pool.
 *
 * Runs on MASKED text, like every other stage.
 */

/** "until the End Phase", "this turn" — kept verbatim, never modelled. */
const DURATION_RE =
  /\b(?:until (?:the end of )?(?:your |your opponent's |the )?(?:next )?(?:End Phase|turn|this turn)[^,.;]*|(?:for the rest of|during) this turn|this turn|while this card (?:is|remains) (?:face-up )?on the field|while you control [^,.;]{3,60})/i;

/** A number, or a phrase that computes one. */
const AMOUNT_RE = /\b([\d,]+)\b/;
const VARIABLE_RE =
  /\b(?:for each|equal to|x\s*\d|half|double|the number of|same as)\b/i;

const STAT_WORDS: { stat: EffectStat; re: RegExp }[] = [
  { stat: EffectStat.ATK_AND_DEF, re: /\bATK\s+and\s+DEF\b/i },
  { stat: EffectStat.ATK, re: /\bATK\b/i },
  { stat: EffectStat.DEF, re: /\bDEF\b/i },
  { stat: EffectStat.PENDULUM_SCALE, re: /\bPendulum Scale\b/i },
  { stat: EffectStat.LEVEL, re: /\bLevel\b/i },
  { stat: EffectStat.RANK, re: /\bRank\b/i },
  { stat: EffectStat.ATTRIBUTE, re: /\bAttribute\b/i },
  { stat: EffectStat.TYPE, re: /\bType\b/i },
];

/**
 * Stat changes. "gain"/"lose" are relative, "becomes" overwrites — a ruling
 * difference, since a monster whose ATK *becomes* 0 has lost its original
 * value while one that *loses* ATK has not.
 */
const STAT_PATTERNS: { mode: 'GAIN' | 'LOSE' | 'BECOMES'; re: RegExp }[] = [
  { mode: 'GAIN', re: /\bgains?\b/i },
  { mode: 'LOSE', re: /\b(?:loses?|reduce)\b/i },
  { mode: 'BECOMES', re: /\bbecomes?\b/i },
];

/**
 * The non-stat modifier kinds, most specific first.
 *
 * Every pattern is anchored on the state it grants rather than on a verb,
 * because these clauses have no verb in the ordinary sense.
 */
const MODIFIER_PATTERNS: { kind: ModifierKind; re: RegExp }[] = [
  {
    kind: ModifierKind.INDESTRUCTIBLE,
    re: /\bcannot be destroyed\b[^.;]*/i,
  },
  { kind: ModifierKind.UNTARGETABLE, re: /\bcannot be targeted\b[^.;]*/i },
  { kind: ModifierKind.UNAFFECTED, re: /\b(?:is|are)\s+unaffected\b[^.;]*/i },
  {
    kind: ModifierKind.CANNOT_BE_MATERIAL,
    re: /\bcannot be used as\b[^.;]*[Mm]aterial[^.;]*/i,
  },
  {
    kind: ModifierKind.CANNOT_BE_TRIBUTED,
    re: /\bcannot be Tributed\b[^.;]*/i,
  },
  {
    kind: ModifierKind.CANNOT_BE_BANISHED,
    re: /\bcannot be banished\b[^.;]*/i,
  },
  {
    kind: ModifierKind.CANNOT_CHANGE_POSITION,
    re: /\bcannot change (?:its |their )?battle position\b[^.;]*/i,
  },
  {
    kind: ModifierKind.CAN_ATTACK_DIRECTLY,
    re: /\bcan attack (?:your opponent )?directly\b[^.;]*/i,
  },
  { kind: ModifierKind.MUST_ATTACK, re: /\bmust attack\b[^.;]*/i },
  { kind: ModifierKind.CANNOT_ATTACK, re: /\bcannot attack\b[^.;]*/i },
  {
    kind: ModifierKind.SUMMON_LOCK,
    re: /\b(?:you|your opponent|neither player)\s+cannot (?:Normal |Special )?Summon\b[^.;]*/i,
  },
  {
    kind: ModifierKind.ACTIVATION_LOCK,
    re: /\bcannot activate\b[^.;]*/i,
  },
  {
    kind: ModifierKind.TREATED_AS,
    re: /\b(?:is|are)\s+(?:also\s+)?treated as\b[^.;]*/i,
  },
];

/** The subject a continuous state applies to, read from the clause. */
const SUBJECT_PATTERNS: RegExp[] = [
  // "All "Qli" monsters you control", "Other Amazoness cards you control"
  /^\s*(?:All|Other|Each|Every)\s+([^,;]{3,80}?)\s+(?:you control|your opponent controls|on the field)/i,
  // "Monsters your opponent controls cannot ..."
  /^\s*([A-Z][^,;]{3,80}?)\s+(?:you control|your opponent controls|on the field)\b/,
  // "The equipped monster cannot attack"
  /^\s*(?:The\s+)?(equipped monster|this card|this monster|it|they|those cards|those monsters)\b/i,
];

const SELF_WORDS =
  /^(?:this card|this monster|it|they|those cards|those monsters)$/i;

/**
 * "the equipped monster" is neither this card nor a describable set: on an
 * Equip Spell it is whichever monster the card is currently attached to, which
 * is only knowable at runtime.
 *
 * Reported as `unresolved` rather than `self`, which would be plainly wrong,
 * or as a `criteria` on "monster", which would claim the state applies to every
 * monster in the game.
 */
const RUNTIME_SUBJECT_RE = /^(?:the\s+)?equipped monster$/i;

/** Who the state applies to. Falls back to `self`, the commonest subject. */
function parseSubject(
  segment: string,
  names: string[],
  ctx: ParserContext,
): EffectTarget {
  for (const re of SUBJECT_PATTERNS) {
    const match = re.exec(segment);
    if (!match?.[1]) continue;
    const phrase = match[1].trim();
    if (SELF_WORDS.test(phrase)) return { kind: 'self' };
    if (RUNTIME_SUBJECT_RE.test(phrase)) {
      return { kind: 'unresolved', text: phrase };
    }
    return parseTarget(phrase, names, ctx).target;
  }
  return { kind: 'self' };
}

function parseAmount(text: string): number | 'VARIABLE' | undefined {
  if (VARIABLE_RE.test(text)) return 'VARIABLE';
  const match = AMOUNT_RE.exec(text);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : undefined;
}

function parseDuration(segment: string, names: string[]): string | undefined {
  const match = DURATION_RE.exec(segment);
  return match ? unmaskBare(match[0], names).trim() : undefined;
}

/**
 * Parse the continuous states one resolution segment applies.
 *
 * Returns an empty array when the segment states none — which is the normal
 * case for an action segment, so this is safe to call on every segment.
 */
export function parseModifiers(
  segment: string,
  names: string[],
  ctx: ParserContext,
): EffectModifier[] {
  const modifiers: EffectModifier[] = [];
  const sourceText = unmaskBare(segment, names).trim();
  const duration = parseDuration(segment, names);
  const target = parseSubject(segment, names, ctx);

  // --- stat changes --------------------------------------------------------
  const statWord = STAT_WORDS.find(({ re }) => re.test(segment));
  const statMode = STAT_PATTERNS.find(({ re }) => re.test(segment));

  if (statWord && statMode) {
    modifiers.push({
      kind: ModifierKind.STAT,
      target,
      stat: statWord.stat,
      mode: statMode.mode,
      ...(parseAmount(segment) !== undefined
        ? { amount: parseAmount(segment) }
        : {}),
      ...(duration ? { duration } : {}),
      sourceText,
    });
  }

  // --- everything else -----------------------------------------------------
  // One modifier per kind: a clause can grant two states at once ("cannot
  // attack, also its ATK and DEF become 100"), but stage 3 has usually already
  // split those into separate segments.
  for (const { kind, re } of MODIFIER_PATTERNS) {
    if (!re.test(segment)) continue;
    modifiers.push({
      kind,
      target,
      ...(duration ? { duration } : {}),
      sourceText,
    });
    break;
  }

  return modifiers;
}
