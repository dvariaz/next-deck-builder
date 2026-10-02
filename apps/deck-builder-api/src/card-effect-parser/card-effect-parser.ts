import { parseActions, segmentRejection } from './actions';
import {
  EffectVerb,
  PARSER_VERSION,
  TriggerTiming,
  type CardEffect,
  type EffectAction,
  type EffectTrigger,
  type ParsedCardEffects,
  type ParserContext,
  type SummonCondition,
} from './card-effect.types';
import { splitClause, type PsctClause } from './clauses';
import { parseCost } from './cost';
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
  if (!clause.resolutions.some((segment) => SEARCH_VERB_RE.test(segment))) {
    return false;
  }
  return !clause.resolutions.some((segment) => segmentRejection(segment));
}

/** Assemble the trigger, preferring the sentence's own over an inherited lead-in. */
function buildTrigger(
  clause: PsctClause,
  leadIn: PsctClause | undefined,
  optional: boolean,
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
    missesTiming: own.timing === TriggerTiming.WHEN && optional,
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

  for (const block of splitBlocks(masked)) {
    // A bullet inherits the trigger and cost stated once before the list.
    const leadIn = block.leadIn ? splitClause(block.leadIn) : undefined;

    splitSentences(block.text).forEach((sentence, sentenceIndex) => {
      const clause = splitClause(sentence);
      const summonConditions = parseSummonConditions(sentence, names);

      const actions: EffectAction[] = [];

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

        for (const segment of clause.resolutions) {
          actions.push(
            ...parseActions(segment, names, ctx, {
              inheritedExcept,
              clauseContext: context.filter(Boolean).join('; '),
            }),
          );
          context.push(segment);
        }
      }

      if (!actions.length && !summonConditions.length) {
        if (!block.quotedEffects && shouldQueue(clause, summonConditions)) {
          unparsed.push(unmaskBare(sentence, names));
        }
        return;
      }

      const costText = [leadIn?.cost, clause.cost].filter(Boolean).join('; ');
      const optional = clause.optional || leadIn?.optional || false;

      effects.push({
        id: `${block.index}.${sentenceIndex}`,
        blockKind: block.kind,
        trigger: buildTrigger(clause, leadIn, optional, names),
        cost: parseCost(costText, names),
        actions,
        restrictions: {
          ...(hardOncePerTurn ? { hardOncePerTurn } : {}),
          // Soft OPT is scoped to the sentence it appears in - Trickstar Light
          // Stage's "Once per turn:" governs only its second effect.
          ...(parseSoftOncePerTurn(sentence) ? { softOncePerTurn: true } : {}),
          exceptNames: extractExceptNames(sentence, names),
          labels: extractLabels(
            [...clause.resolutions, clause.trigger, block.leadIn],
            names,
          ),
          summonConditions,
        },
        optional,
        sourceText: unmaskBare(sentence, names),
      });
    });
  }

  const needsReview =
    unparsed.length > 0 ||
    (effects.length === 0 && LOOKS_LIKE_EFFECT_RE.test(description ?? ''));

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
