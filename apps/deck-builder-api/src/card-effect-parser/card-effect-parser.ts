import { parseActions, segmentRejection } from './actions';
import { CardType, SpellTrapSubType } from '../../generated/prisma/enums';
import {
  EffectType,
  EffectVerb,
  PARSER_VERSION,
  TriggerTiming,
  type CardEffect,
  type EffectAction,
  type EffectModifier,
  type EffectTrigger,
  type ParsedCardEffects,
  type ParserContext,
  type SummonCondition,
} from './card-effect.types';
import { splitClause, type PsctClause } from './clauses';
import { parseCost } from './cost';
import { parseModifiers } from './modifiers';
import { preprocess, unmaskBare } from './normalize';
import {
  extractLabels,
  parseHardOncePerTurn,
  parseSoftOncePerTurn,
  parseSummonConditions,
} from './restrictions';
import { splitBlocks, splitSentences } from './segment';
import { extractExceptNames } from './target';

/**
 * The card effect parser entry point.
 *
 * Pipeline: preprocess -> blocks -> sentences -> PSCT clauses -> actions,
 * with restrictions layered on at the scope each one actually belongs to.
 *
 * Pure and framework-free, so both the Nest service and the `tsx` batch script
 * can call it.
 */

/**
 * Does this text look like it should have produced an effect? Deliberately
 * loose - it only drives the review queue, and over-queueing costs nothing.
 *
 * "Set" needs the same count lookahead the verb table uses, or every "all Set
 * cards on the field" reads as a Set action.
 */
const LOOKS_LIKE_EFFECT_RE =
  /\b(?:Add|Special Summon|Normal Summon|Send|Banish|Excavate|Draw|Destroy|Negate)\b|\bSet\s+(?=\d|this\b|an?\b)/i;

/** Verbs whose presence in an unparsed resolution is worth flagging. */
const SEARCH_VERB_RE =
  /\b(?:Add|Special Summon|Normal Summon)\b|\bSet\s+(?=\d|this\b|an?\b)/i;

/**
 * Should a sentence that produced no actions go to the review queue?
 *
 * Only when the parser FAILED, never when it declined. Three things make a
 * no-action sentence expected rather than a gap:
 *
 *  - it is a Summon condition, which is classified rather than performed;
 *  - every one of its resolution segments was rejected by a guard, which is
 *    the parser working correctly on a negation or a passive description;
 *  - the only search verb is in the trigger, where verbs describe the event
 *    that happened, not an action to take.
 *
 * The last two carried 922 of the 1,354 sentences the previous version queued.
 */
function shouldQueue(
  clause: PsctClause,
  summonConditions: SummonCondition[],
): boolean {
  if (summonConditions.length) return false;
  if (!clause.resolutions.some(({ text }) => SEARCH_VERB_RE.test(text))) {
    return false;
  }
  return !clause.resolutions.some(({ text }) => segmentRejection(text));
}

/**
 * Sentences that are not effects at all.
 *
 * These make up 7,027 of the sentences in the pool, and recording them would
 * swamp the real effects:
 *
 *  - a bare once-per-turn statement, which is already captured as a
 *    restriction on the effects it governs rather than as an effect of its own;
 *  - an Extra Deck materials line ("2 Level 4 monsters", '"Gladiator Beast
 *    Laquari" + 2 "Gladiator Beast" monsters'), which is a Summon requirement
 *    printed above the effect text, not an effect;
 *  - a parenthetical aside ("(This card is always treated as ...)"), which
 *    alias.ts handles as identity rather than behaviour.
 */
const NOT_AN_EFFECT_PATTERNS: RegExp[] = [
  /^\s*You can only (?:use|activate|Special Summon)\b[^.]*per turn\.?\s*$/i,
  /^\s*You can only control\b[^.]*\.?\s*$/i,
  // A materials line: counts and descriptors joined by "+", or a lone count
  // phrase, with no verb and no clause punctuation.
  /^\s*\d+\+?\s[^.;:]*\s\+\s[^.;:]*\.?\s*$/,
  /^\s*\u0001Q\d+\u0001[^.;:]*\s\+\s[^.;:]*\.?\s*$/,
  /^\s*\d+\+?\s(?:or more\s)?[^.;:]{0,60}monsters?\.?\s*$/i,
  // A single parenthesised group and nothing else. `[^)]` rather than `.` is
  // load-bearing: a greedy version also matches any sentence that merely
  // STARTS with "(" and ends with ")", which swallowed Tiki Peace's
  // "(Quick Effect): ... Special Summon ... (that card is NOT treated as a
  // Trap)." and lost a real Special Summon with it.
  /^\s*\([^)]*\)\.?\s*$/,
];

function isNotAnEffect(sentence: string): boolean {
  return NOT_AN_EFFECT_PATTERNS.some((re) => re.test(sentence));
}

/**
 * Classify the effect.
 *
 * CONTINUOUS is read from an absence — no trigger and no activation
 * punctuation — which is exactly how the game defines it: a continuous effect
 * never activates, it just applies. The rest are told apart by what opens
 * them, and ACTIVATED is the honest answer when the card activates but its
 * wording does not say which category it falls into (most Spells and Traps).
 */
/**
 * Subtypes whose card REMAINS on the field, and which can therefore print a
 * continuous effect alongside the effect they activate with.
 *
 * A Normal or Quick-Play Spell activates, resolves and goes to the GY, so
 * every line of its text belongs to that activation.
 */
const PERSISTENT_SUBTYPES: readonly SpellTrapSubType[] = [
  SpellTrapSubType.CONTINUOUS,
  SpellTrapSubType.FIELD,
  SpellTrapSubType.EQUIP,
];

/** Can this card print a continuous effect at all? */
function canBeContinuous(ctx: ParserContext): boolean {
  if (ctx.cardType === CardType.MONSTER) return true;
  return (
    !!ctx.spellTrapSubType && PERSISTENT_SUBTYPES.includes(ctx.spellTrapSubType)
  );
}

function classifyEffectType(
  clause: PsctClause,
  leadIn: PsctClause | undefined,
  chains: boolean | undefined,
  ctx: ParserContext,
  hasModifiers: boolean,
): EffectType {
  if (clause.quickEffect || leadIn?.quickEffect) return EffectType.QUICK;

  const trigger = clause.trigger ?? leadIn?.trigger;
  if (trigger && /^\s*FLIP\b/i.test(trigger)) return EffectType.FLIP;

  // No trigger and no activation punctuation: nothing ever activates it.
  //
  // Only reachable for a card that can hold a continuous effect — a Spell or
  // Trap that leaves the field after resolving has no such line, and reading
  // Terraforming's single unpunctuated sentence as continuous would be wrong.
  // A persistent Spell/Trap additionally has to actually state a continuous
  // state, or its unpunctuated activation text would read as continuous too.
  if (!trigger && chains === false && canBeContinuous(ctx)) {
    if (ctx.cardType === CardType.MONSTER || hasModifiers) {
      return EffectType.CONTINUOUS;
    }
  }

  const timing = clause.trigger ? clause.timing : leadIn?.timing;
  if (timing === TriggerTiming.WHEN || timing === TriggerTiming.IF) {
    return EffectType.TRIGGER;
  }
  if (timing === TriggerTiming.EACH_TIME) return EffectType.TRIGGER;
  // "During your Main Phase:" with no event — you choose to activate it.
  if (timing === TriggerTiming.DURING) return EffectType.IGNITION;
  if (timing === TriggerTiming.WHILE || timing === TriggerTiming.AFTER) {
    return EffectType.CONTINUOUS;
  }

  return EffectType.ACTIVATED;
}

/**
 * Whether the effect starts a chain, from the PSCT punctuation clue.
 *
 * A bullet inherits its lead-in's punctuation, so the clue may sit there:
 * A.I. Connect states "... activate 1 of these effects;" once, and each bullet
 * under it is an activated effect.
 *
 * Returns undefined for a pre-PSCT printing, where the clue is absent rather
 * than negative. See CardEffect.startsChain.
 */
function startsChain(
  clause: PsctClause,
  leadIn: PsctClause | undefined,
  ctx: ParserContext,
  hasModifiers: boolean,
): boolean | undefined {
  if (clause.psct || leadIn?.psct) return true;
  if (clause.legacy) return undefined;

  // A Spell or Trap starts a chain when it is activated, whatever its
  // punctuation — the clue is a MONSTER-effect rule. The exception is a line
  // on a card that stays on the field and states a continuous state, which
  // applies without being activated.
  if (ctx.cardType !== CardType.MONSTER) {
    const continuousLine = canBeContinuous(ctx) && hasModifiers;
    return continuousLine ? false : true;
  }

  return false;
}

/** Assemble the trigger, preferring the sentence's own over an inherited lead-in. */
function buildTrigger(
  clause: PsctClause,
  leadIn: PsctClause | undefined,
  optional: boolean,
  chains: boolean | undefined,
  names: string[],
): EffectTrigger | undefined {
  const own = clause.trigger ? clause : leadIn?.trigger ? leadIn : undefined;
  if (!own?.trigger) return undefined;

  const exclusions = [
    ...new Set([...clause.exclusions, ...(leadIn?.exclusions ?? [])]),
  ].map((text) => unmaskBare(text, names));

  return {
    text: unmaskBare(own.trigger, names),
    timing: own.timing,
    // Only an OPTIONAL "When" trigger effect can miss the timing. See
    // TriggerTiming for why this is the one wording distinction with teeth.
    // An effect that does not activate has no window to miss.
    missesTiming:
      own.timing === TriggerTiming.WHEN && optional && chains !== false,
    quickEffect: clause.quickEffect || leadIn?.quickEffect || false,
    exclusions,
  };
}

export function parseCardEffects(
  description: string,
  ctx: ParserContext,
  parsedAt: string = new Date().toISOString(),
): ParsedCardEffects {
  const { masked, names } = preprocess(description ?? '');

  // Hard once-per-turn is a property of the CARD, not of any one sentence:
  // "You can only use each effect of "X" once per turn" caps the whole play.
  const hardOncePerTurn = parseHardOncePerTurn(masked, names);

  const effects: CardEffect[] = [];
  const unparsed: string[] = [];

  // Sentences seen, and those deliberately classified as not being effects.
  // When every sentence is a non-effect the card has no gap to review, even
  // though its text names a search verb — "You can only Special Summon "X"
  // once per turn." is a restriction, not a missing effect.
  let sentencesSeen = 0;
  let sentencesSkipped = 0;

  for (const block of splitBlocks(masked)) {
    // A bullet inherits the trigger and cost stated once before the list.
    const leadIn = block.leadIn ? splitClause(block.leadIn) : undefined;

    splitSentences(block.text).forEach((sentence, sentenceIndex) => {
      const clause = splitClause(sentence);
      const summonConditions = parseSummonConditions(sentence, names);

      sentencesSeen++;

      // A once-per-turn statement or a materials line is not an effect, and
      // recording one would bury the real effects. See NOT_AN_EFFECT_PATTERNS.
      if (!summonConditions.length && isNotAnEffect(sentence)) {
        sentencesSkipped++;
        return;
      }

      const actions: EffectAction[] = [];
      const modifiers: EffectModifier[] = [];

      // Bullets under "...includes any of these effects" QUOTE effects the
      // card negates. They are not instructions, so they yield no actions.
      //
      // A Summon condition yields none either: "Must first be Special
      // Summoned by banishing 3 "Gladiator Beast" monsters you control"
      // describes this card's own arrival, and reading it as an action makes
      // those monsters look searchable.
      if (!block.quotedEffects && !summonConditions.length) {
        const inheritedExcept = extractExceptNames(sentence, names);

        // A segment's antecedent may be the cost half OR an earlier segment of
        // the same clause, so the context grows as the chain is walked.
        const context: string[] = [clause.cost ?? leadIn?.cost ?? ''];

        for (const { text, conjunction } of clause.resolutions) {
          actions.push(
            ...parseActions(text, names, ctx, {
              inheritedExcept,
              conjunction,
              clauseContext: context.filter(Boolean).join('; '),
            }),
          );
          // Independent of the action guards on purpose: a continuous state is
          // often phrased as a negation ("cannot be destroyed by battle"), and
          // stage 6 rejects those outright.
          modifiers.push(...parseModifiers(text, names, ctx));
          context.push(text);
        }
      }

      if (!actions.length && !modifiers.length && !summonConditions.length) {
        if (!block.quotedEffects && shouldQueue(clause, summonConditions)) {
          unparsed.push(unmaskBare(sentence, names));
        }
        return;
      }

      const costText = [leadIn?.cost, clause.cost].filter(Boolean).join('; ');
      const optional = clause.optional || leadIn?.optional || false;
      const chains = startsChain(clause, leadIn, ctx, modifiers.length > 0);

      effects.push({
        id: `${block.index}.${sentenceIndex}`,
        blockKind: block.kind,
        effectType: classifyEffectType(
          clause,
          leadIn,
          chains,
          ctx,
          modifiers.length > 0,
        ),
        trigger: buildTrigger(clause, leadIn, optional, chains, names),
        ...(chains === undefined ? {} : { startsChain: chains }),
        cost: parseCost(costText, names),
        actions,
        modifiers,
        restrictions: {
          ...(hardOncePerTurn ? { hardOncePerTurn } : {}),
          // Soft OPT is scoped to the sentence it appears in - Trickstar Light
          // Stage's "Once per turn:" governs only its second effect.
          ...(parseSoftOncePerTurn(sentence) ? { softOncePerTurn: true } : {}),
          exceptNames: extractExceptNames(sentence, names),
          labels: extractLabels(
            [
              ...clause.resolutions.map(({ text }) => text),
              clause.trigger,
              block.leadIn,
            ],
            names,
          ),
          summonConditions,
        },
        optional,
        sourceText: unmaskBare(sentence, names),
      });
    });
  }

  // The card-level fallback is for text that looks like an effect but produced
  // nothing. It is suppressed when every sentence was a classified non-effect,
  // since there is then nothing that failed to parse.
  const allSentencesSkipped =
    sentencesSeen > 0 && sentencesSkipped === sentencesSeen;

  const needsReview =
    unparsed.length > 0 ||
    (effects.length === 0 &&
      !allSentencesSkipped &&
      LOOKS_LIKE_EFFECT_RE.test(description ?? ''));

  return {
    version: PARSER_VERSION,
    parsedAt,
    origin: 'RULES',
    effects,
    unparsed,
    needsReview,
  };
}

/** Every action across every effect, flattened. */
export function allActions(parsed: ParsedCardEffects): EffectAction[] {
  return parsed.effects.flatMap((effect) => effect.actions);
}

/** Resolved actions whose verb can put a card somewhere you can use it. */
export function resolvedSearchActions(
  parsed: ParsedCardEffects,
): { effect: CardEffect; action: EffectAction }[] {
  const searchVerbs: EffectVerb[] = [
    EffectVerb.ADD,
    EffectVerb.SPECIAL_SUMMON,
    EffectVerb.NORMAL_SUMMON,
    EffectVerb.SET,
  ];

  return parsed.effects.flatMap((effect) =>
    effect.actions
      .filter((action) => action.resolved && searchVerbs.includes(action.verb))
      .map((action) => ({ effect, action })),
  );
}
