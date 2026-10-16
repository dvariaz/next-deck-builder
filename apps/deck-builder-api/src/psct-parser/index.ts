/**
 * The PSCT parser pipeline.
 *
 *   Raw card text
 *     -> normalization            (normalize.ts, with span mapping)
 *     -> protected tokenization   (lexer.ts — quoted names, parentheticals)
 *     -> lexical analysis         (lexer.ts, vocabulary from lexicon.ts)
 *     -> structure                (structure.ts — blocks, sentences, clauses)
 *     -> syntactic parsing        (grammar.ts — Chevrotain CST)
 *     -> CST to semantic AST      (visitor.ts)
 *     -> reference resolution     (references.ts)
 *     -> effect classification    (classify.ts)
 *     -> validation               (schema.ts)
 *
 * Pure and framework-free: no Nest, no Prisma client, no decorators, so the
 * same code runs in a Nest service, in a `tsx` batch script, and in unit tests
 * against a fixture corpus. The only thing it needs from outside is the small
 * vocabulary in `ParserContext`, which is injected rather than queried.
 *
 * Design rule throughout: an omitted fact is a missing feature, a wrong fact
 * destroys trust in the whole dataset. Every stage prefers a diagnostic over a
 * guess.
 */

import {
  ConditionKind,
  DiagnosticCode,
  DiagnosticSeverity,
  EffectTextFormat,
  PARSER_VERSION,
  SelectionMode,
} from './ast';
import type { IToken } from 'chevrotain';
import type {
  ConditionNode,
  CostNode,
  Diagnostic,
  EffectNode,
  ParsedCard,
  ParsedEffect,
  ParserContext,
  TargetNode,
} from './ast';
import { applyMissesTiming, readConditions } from './conditions';
import { classify, startsChain, type ClassifyInput } from './classify';
import { scoreCard, scoreEffect } from './confidence';
import { parseTokens } from './grammar';
import { LineBreak, lex, Period, spanOfTokens } from './lexer';
import { normalize } from './normalize';
import { resolveReferences } from './references';
import {
  isNotAnEffect,
  mergeRestrictions,
  readRestrictions,
} from './restrictions';
import {
  hasActionToken,
  imagesOf,
  isOptional,
  splitBlocks,
  splitClause,
  splitResolutionSegments,
  splitSentences,
  type TokenBlock,
} from './structure';
import {
  assembleResolution,
  clauseSelectionOf,
  linkageFromTokens,
  readActivation,
  readResolution,
  readSegment,
  refreshResolved,
  type LinkedNode,
  type VisitContext,
} from './visitor';
import { validateParsedCard } from './schema';

export * from './ast';
export { validateParsedCard } from './schema';
export type { CorpusMetrics } from './metrics';

/**
 * Decide whether a card's text is PSCT or pre-PSCT, from evidence only.
 *
 * Two signals, both of which the parser genuinely observed rather than guessed:
 *
 *  - a LEGACY_TEXT diagnostic, raised when a condition had to be recovered from
 *    a comma because the sentence carried no colon;
 *  - a `legacy_select` selection, which is an un-errata'd "select" whose
 *    targeting status the printed text does not state.
 *
 * Absence of both means PSCT. That is the honest default: modern text is the
 * overwhelming majority, and the signals above only fire on constructs that
 * cannot occur in PSCT. A card wrongly called `psct` still parses; one wrongly
 * called `legacy` would be handed to an LLM pass it does not need.
 */
function detectFormat(effects: readonly ParsedEffect[]): EffectTextFormat {
  for (const effect of effects) {
    if (effect.diagnostics.some((d) => d.code === DiagnosticCode.LEGACY_TEXT)) {
      return EffectTextFormat.LEGACY;
    }
    const legacySelection = effect.activation.some(
      (node) =>
        node.kind === 'target' &&
        node.selection === SelectionMode.LEGACY_SELECT,
    );
    if (legacySelection) return EffectTextFormat.LEGACY;
  }
  return EffectTextFormat.PSCT;
}

/** How many action nodes a resolution tree holds, for comparing two attempts. */
function countActions(node: EffectNode | null): number {
  if (!node) return 0;
  switch (node.kind) {
    case 'action':
      return 1;
    case 'modifier':
      return 0;
    case 'conditional':
      return countActions(node.then);
    case 'sequence':
    case 'parallel':
      return node.children.reduce((n, c) => n + countActions(c), 0);
  }
}

/** "FLIP:" opens a flip effect, which is its own activation category. */
const FLIP_RE = /^\s*FLIP\s*$/i;

/**
 * Does this sentence look like it should have produced an effect?
 *
 * Deliberately loose — it only decides whether a dropped sentence earns a
 * TEMPLATE_NOT_SUPPORTED diagnostic, and over-reporting into the review queue
 * costs nothing while under-reporting hides a real gap.
 */
const LOOKS_LIKE_EFFECT_RE =
  /\b(?:add|destroy|negate|banish|draw|send|discard|tribute|detach|equip|attach|excavate|reveal|return|shuffle|place|target|select|choose|gain|gains|lose|loses|becomes|cannot|inflict|Special Summon|Normal Summon|Summon|Set)\b/i;

/** Does this effect node tree contain only continuous states? */
function modifiersOnly(node: EffectNode | null): boolean {
  if (!node) return true;

  switch (node.kind) {
    case 'action':
      return false;
    case 'modifier':
      return true;
    case 'conditional':
      return modifiersOnly(node.condition) && modifiersOnly(node.then);
    case 'sequence':
    case 'parallel':
      return node.children.every(modifiersOnly);
  }
}

/**
 * Parse one card's effect text.
 *
 * Never throws. A card whose text defeats every stage comes back with zero
 * effects and the diagnostics explaining why, which is the honest result and
 * keeps a batch run over the whole pool from aborting on one card.
 */
export function parseCard(sourceText: string, ctx: ParserContext): ParsedCard {
  const nt = normalize(sourceText);
  const { tokens, diagnostics: lexDiagnostics } = lex(nt);

  const cardDiagnostics: Diagnostic[] = [...nt.diagnostics, ...lexDiagnostics];

  let counter = 0;
  const nextId = () => `t${counter++}`;

  /**
   * What a bullet list's lead-in contributes to each of its bullets.
   *
   * "You can discard 1 card, then activate 1 of these effects;" states the cost
   * ONCE, above the list, and it applies to whichever bullet the player picks.
   * Without this every bullet reads as a free effect — an understated cost on
   * 525 cards in the pool.
   *
   * Cached by the lead-in token array, which every bullet in a group shares by
   * reference, so the lead-in is parsed once per group rather than once per
   * bullet (which would also mint duplicate target ids).
   */
  const leadInCache = new Map<IToken[], Inherited>();

  const inheritedFor = (block: TokenBlock): Inherited | undefined => {
    if (!block.leadIn) return undefined;
    const cached = leadInCache.get(block.leadIn);
    if (cached) return cached;
    const parsed = parseLeadIn(nt, ctx, nextId, block.leadIn);
    leadInCache.set(block.leadIn, parsed);
    return parsed;
  };

  const effects: ParsedEffect[] = [];

  /**
   * Restrictions stated by sentences that are not themselves effects.
   *
   * "You can only use this effect of "X" once per turn." performs nothing and
   * must not become an empty effect, but it limits the effects printed around
   * it. Collected here and folded in below, rather than dropped with the
   * sentence.
   */
  const governing: ReturnType<typeof readRestrictions>[] = [];

  for (const block of splitBlocks(tokens)) {
    const sentences = splitSentences(block.tokens);
    /**
     * Effects parsed so far in THIS block, as antecedents for later sentences.
     * Scoped to the block because a Pendulum card's two halves are independent
     * bodies — a pronoun in the monster half never refers back to the Pendulum
     * half.
     */
    const blockEffects: ParsedEffect[] = [];

    sentences.forEach((sentence, sentenceIndex) => {
      const sentenceText = imagesOf(sentence);

      // A sentence that is not an effect at all — a bare once-per-turn line, an
      // Extra Deck materials line, a lone parenthetical — is skipped rather
      // than queued. Recording these would swamp the real effects.
      if (isNotAnEffect(sentenceText)) {
        const stated = readRestrictions(
          sentenceText,
          spanOfTokens(nt, sentence),
          ctx.cardName,
        );
        if (
          stated.hardOncePerTurn ||
          stated.softOncePerTurn ||
          stated.labels.length
        ) {
          governing.push(stated);
        }
        return;
      }

      // Bullets that the lead-in marks as QUOTED effects describe what the card
      // negates, not what it does. Ash Blossom's bullets read like searches;
      // treating them as its own would invert the card entirely.
      if (block.quotedEffects) return;

      const effect = parseSentence({
        nt,
        ctx,
        nextId,
        sentence,
        sentenceText,
        blockIndex: block.index,
        blockKind: block.kind,
        sentenceIndex,
        priorEffects: blockEffects,
        dropped: cardDiagnostics,
        inherited: inheritedFor(block),
      });

      // A lead-in that only INTRODUCES its list is not an effect: it would be a
      // cost with no resolution. Its cost reaches the bullets through
      // `inherited` instead, so emitting it here too would double-count.
      if (effect && block.isLeadIn && effect.resolution === null) return;

      if (effect) {
        blockEffects.push(effect);
        effects.push(effect);
      }
    });
  }

  // Fold the governing restrictions into every effect they limit. A hard
  // once-per-turn is name-locked, so it limits the whole play rather than one
  // sentence of it.
  if (governing.length) {
    for (const effect of effects) {
      effect.restrictions = governing.reduce(
        (acc, g) => mergeRestrictions(acc, g),
        effect.restrictions,
      );
    }
  }

  const parsed: ParsedCard = {
    cardId: ctx.cardId,
    cardName: ctx.cardName,
    sourceText,
    normalizedText: nt.normalized,
    effects,
    diagnostics: cardDiagnostics,
    confidence: scoreCard(effects, cardDiagnostics),
    parserVersion: PARSER_VERSION,
    parsedAt: new Date().toISOString(),
    format: detectFormat(effects),
    origin: 'rules',
  };

  // Validation is advisory at this layer: a structural violation is recorded on
  // the card so the batch script can refuse to persist it, rather than thrown
  // here where it would take down the whole run.
  const validation = validateParsedCard(parsed);
  if (!validation.valid) {
    parsed.diagnostics.push({
      severity: DiagnosticSeverity.ERROR,
      code: DiagnosticCode.SCHEMA_VALIDATION_ERROR,
      message: validation.errors.join('; '),
      span: null,
    });
    parsed.confidence = scoreCard(effects, parsed.diagnostics);
  }

  return parsed;
}

/** The activation and condition a bullet inherits from its list's lead-in. */
export interface Inherited {
  activation: (CostNode | TargetNode)[];
  condition: ConditionNode[];
  /**
   * Whether the LEAD-IN carried the colon/semicolon.
   *
   * A bullet's own text usually has neither — the punctuation lives above the
   * list — so without inheriting this a bullet with a real discard cost
   * classifies as a continuous or static effect instead of an activated one.
   */
  hasActivationPunctuation: boolean;
}

/**
 * The phrase that introduces a bullet list, which is not a cost.
 *
 * "then activate 1 of these effects" sits in the lead-in's activation half and
 * otherwise parses as an unrecognised cost, inventing a payment on every
 * bullet that inherits it.
 */
const LIST_INTRODUCER_RE =
  /\bactivate\s+\d+\s+of\s+(?:these|the following)\s+effects?\b/i;

/**
 * Parse a bullet list's lead-in for what it contributes to each bullet.
 *
 * Only the LAST sentence is read: an earlier sentence in the lead-in is a
 * separate effect of the card (and is parsed as one in its own right), while
 * the sentence immediately above the list is the one that introduces it.
 */
function parseLeadIn(
  nt: ReturnType<typeof normalize>,
  ctx: ParserContext,
  nextId: () => string,
  leadIn: IToken[],
): Inherited {
  const empty: Inherited = {
    activation: [],
    condition: [],
    hasActivationPunctuation: false,
  };

  const sentences = splitSentences(leadIn);
  const last = sentences[sentences.length - 1];
  if (!last) return empty;

  const parts = splitClause(last);
  const strip = (ts: IToken[]) =>
    ts.filter((t) => t.tokenType !== Period && t.tokenType !== LineBreak);

  const condition = readConditions(nt, strip(parts.condition));
  const base = {
    condition,
    hasActivationPunctuation: parts.hasActivationPunctuation,
  };

  const activationTokens = strip(parts.activation);
  if (activationTokens.length === 0) return { ...base, activation: [] };

  const attempt = parseTokens(activationTokens, 'activationClause');
  if (!attempt.cst) return { ...base, activation: [] };

  const vc: VisitContext = {
    nt,
    ctx,
    nextId,
    clauseSelection: clauseSelectionOf(attempt.cst),
  };

  const activation = readActivation(vc, attempt.cst).filter(
    (node) => !LIST_INTRODUCER_RE.test(node.span.text),
  );

  return { ...base, activation };
}

interface SentenceInput {
  nt: ReturnType<typeof normalize>;
  ctx: ParserContext;
  nextId: () => string;
  sentence: Parameters<typeof imagesOf>[0];
  sentenceText: string;
  blockIndex: number;
  blockKind: ParsedEffect['blockKind'];
  sentenceIndex: number;
  /** Earlier effects in the same block, for cross-sentence references. */
  priorEffects: readonly ParsedEffect[];
  /** What this bullet inherits from its list's lead-in, if it is a bullet. */
  inherited?: Inherited;
  /**
   * Where diagnostics go when a sentence yields no effect to hang them on.
   *
   * Without this they are lost with the discarded sentence, and the card ends
   * up with no effects AND no explanation — a silent failure, which is the one
   * outcome this parser is built to avoid.
   */
  dropped: Diagnostic[];
}

/** Parse one sentence into an effect, or null when it yields nothing at all. */
function parseSentence(input: SentenceInput): ParsedEffect | null {
  const { nt, ctx, nextId, sentence, sentenceText } = input;
  const diagnostics: Diagnostic[] = [];

  const parts = splitClause(sentence);
  const optional = isOptional(sentence);
  const span = spanOfTokens(nt, sentence);

  // Periods are sentence terminators, already consumed by the splitter, and a
  // surviving line break is a cosmetic wrap. Leaving either in would make the
  // clause end in a token no grammar rule mentions.
  const withoutPeriods = (ts: typeof sentence) =>
    ts.filter((t) => t.tokenType !== Period && t.tokenType !== LineBreak);

  const conditionTokens = withoutPeriods(parts.condition);
  const activationTokens = withoutPeriods(parts.activation);
  const resolutionTokens = withoutPeriods(parts.resolution);
  const riderTokens = withoutPeriods(parts.trailingRider);

  const isFlip = FLIP_RE.test(imagesOf(conditionTokens));

  // Leading and trailing conditions are kept apart deliberately: only a
  // LEADING one gates activation, so only it may feed classification or
  // `missesTiming`. See `ConditionPosition`.
  // A bullet's lead-in states its cost and trigger once, above the list, so
  // those are prepended here: they are paid/checked BEFORE the bullet's own.
  const inherited = input.inherited;
  const conditions = [
    ...(inherited?.condition ?? []),
    ...readConditions(nt, conditionTokens),
  ];
  const trailingConditions = readConditions(
    nt,
    withoutPeriods(parts.trailingCondition),
    'trailing',
  );

  const restrictions = readRestrictions(sentenceText, span, ctx.cardName);
  const hasSummonCondition = restrictions.summonConditions.length > 0;

  /**
   * A Summon condition is CLASSIFIED, not parsed.
   *
   * "Must first be Special Summoned by Tributing 3 Fiend monsters" is full of
   * Summon and Tribute verbs but describes no searchable action — it describes
   * how the card itself arrives on the field. Running the resolution grammar
   * over it produces a parse error for a sentence the parser in fact
   * understands perfectly, so the grammar is skipped entirely.
   */
  if (hasSummonCondition) {
    const classifyInput: ClassifyInput = {
      conditions,
      hasActivationPunctuation: parts.hasActivationPunctuation,
      legacyCondition: parts.legacyCondition,
      hasSummonCondition: true,
      modifiersOnly: true,
      isFlip,
    };

    const summonEffect: ParsedEffect = {
      id: `${input.blockIndex}.${input.sentenceIndex}`,
      blockKind: input.blockKind,
      effectKind: classify(classifyInput, ctx),
      condition: applyMissesTiming(conditions, optional),
      activation: [],
      resolution: null,
      restrictions,
      optional,
      sourceText: sentenceText,
      span,
      diagnostics,
      confidence: 1,
    };

    const chain = startsChain(classifyInput, ctx);
    if (chain !== undefined) summonEffect.startsChain = chain;
    summonEffect.confidence = scoreEffect(summonEffect);
    return summonEffect;
  }

  // The activation half first: it declares the targets the resolution refers
  // back to, and the selection mode the resolution's actions inherit.
  let activation: (CostNode | TargetNode)[] = [];
  let clauseSelection: SelectionMode = 'none';

  if (inherited?.activation.length) {
    activation = [...inherited.activation];
    // The lead-in's selection carries into the bullet, so a bullet that says
    // "destroy it" can resolve against a target the lead-in declared.
    const declared = inherited.activation.find(
      (n): n is TargetNode => n.kind === 'target' && n.selection !== 'none',
    );
    if (declared) clauseSelection = declared.selection;
  }

  if (activationTokens.length) {
    const attempt = parseTokens(activationTokens, 'activationClause');
    if (attempt.cst) {
      clauseSelection = clauseSelectionOf(attempt.cst);
      const vc: VisitContext = { nt, ctx, nextId, clauseSelection };
      activation = [...activation, ...readActivation(vc, attempt.cst)];
    }
    for (const error of attempt.errors) {
      diagnostics.push({
        severity: DiagnosticSeverity.WARNING,
        code: DiagnosticCode.GRAMMAR_PARSE_ERROR,
        message: `Activation clause: ${error.message}`,
        span: error.token ? spanOfTokens(nt, [error.token]) : span,
      });
    }
  }

  let resolution: EffectNode | null = null;

  /**
   * The resolution is parsed WITH its `, but ...` rider first.
   *
   * Peeling the rider unconditionally was a bad trade: it rescues cards whose
   * rider breaks the whole clause (Sangan lost its Add that way) but throws
   * away rider actions on the many cards whose rider parses perfectly well —
   * measured as 165 actions lost across the pool. So the peel is a FALLBACK,
   * attempted only once the full parse has actually failed. Never give up a
   * fact that was already available.
   */
  const fullResolution = riderTokens.length
    ? [...resolutionTokens, ...riderTokens]
    : resolutionTokens;

  if (fullResolution.length) {
    let attempt = parseTokens(fullResolution, 'resolutionClause');
    let peeled = false;

    const failed = (a: typeof attempt) => !a.cst || a.errors.length > 0;

    if (failed(attempt) && riderTokens.length && resolutionTokens.length) {
      const retry = parseTokens(resolutionTokens, 'resolutionClause');
      // Only accept the retry if it is strictly better: a real tree, and no
      // more errors than the full attempt produced.
      if (retry.cst && retry.errors.length < attempt.errors.length) {
        attempt = retry;
        peeled = true;
      } else if (retry.cst && !attempt.cst) {
        attempt = retry;
        peeled = true;
      }
    }

    if (peeled && hasActionToken(riderTokens)) {
      diagnostics.push({
        severity: DiagnosticSeverity.WARNING,
        code: DiagnosticCode.TEMPLATE_NOT_SUPPORTED,
        message: `Trailing "but" rider was not interpreted: ${imagesOf(riderTokens)}`,
        span: spanOfTokens(nt, riderTokens),
      });
    }

    const vc: VisitContext = { nt, ctx, nextId, clauseSelection };

    if (attempt.cst) resolution = readResolution(vc, attempt.cst);

    /**
     * Segment recovery.
     *
     * When the clause did not parse cleanly, retry it CONJUNCT BY CONJUNCT and
     * keep every conjunct that parses. Parsed as one clause, a single bad
     * conjunct fails inside the sequence rule and discards everything — the
     * largest single cause of lost search actions in the pool (529 of the 980
     * cards the older parser resolves and this one did not).
     *
     * Whichever attempt recovers MORE actions wins, with the whole-clause
     * parse preferred on a tie because its conjunction linkage is richer. That
     * ordering is the point: recovery may never cost a fact that was already
     * available, which is the mistake the unconditional rider peel made.
     */
    if (failed(attempt)) {
      const segments = splitResolutionSegments(
        peeled ? resolutionTokens : fullResolution,
      );

      if (segments.length > 1 || !attempt.cst) {
        const parts: LinkedNode[] = [];
        const unparsed: IToken[][] = [];

        for (const segment of segments) {
          const sub = parseTokens(segment.tokens, 'actionGroup');
          if (!sub.cst) {
            unparsed.push(segment.tokens);
            continue;
          }
          const node = readSegment(
            vc,
            sub.cst,
            linkageFromTokens(segment.conjunctions),
          );
          if (node)
            parts.push({ node, link: linkageFromTokens(segment.conjunctions) });
          else unparsed.push(segment.tokens);
        }

        const recovered = assembleResolution(parts, span);

        if (countActions(recovered) > countActions(resolution)) {
          resolution = recovered;
          // Report what was given up, so a dropped conjunct is declared rather
          // than silently missing.
          for (const tokens of unparsed) {
            diagnostics.push({
              severity: DiagnosticSeverity.WARNING,
              code: DiagnosticCode.TEMPLATE_NOT_SUPPORTED,
              message: `Conjunct not interpreted: ${imagesOf(tokens)}`,
              span: spanOfTokens(nt, tokens),
            });
          }
          // The whole-clause errors describe a parse that was discarded; the
          // per-conjunct diagnostics above replace them.
          attempt = { cst: attempt.cst, errors: [] };
        }
      }
    }

    for (const error of attempt.errors) {
      diagnostics.push({
        severity: DiagnosticSeverity.WARNING,
        code: DiagnosticCode.GRAMMAR_PARSE_ERROR,
        message: `Resolution clause: ${error.message}`,
        span: error.token ? spanOfTokens(nt, [error.token]) : span,
      });
    }
    // Only when NOTHING was understood. Segment recovery can produce a
    // resolution from a clause whose whole-clause parse returned no CST, and
    // claiming "no supported template" then would contradict the actions
    // sitting in the output.
    if (!attempt.cst && attempt.errors.length === 0 && resolution === null) {
      diagnostics.push({
        severity: DiagnosticSeverity.WARNING,
        code: DiagnosticCode.TEMPLATE_NOT_SUPPORTED,
        message: 'The resolution matched no supported template.',
        span,
      });
    }
  }

  /**
   * What classification is allowed to see.
   *
   * Leading conditions, plus any trailing WINDOW. The distinction matters in
   * both directions:
   *
   *  - a trailing "if you control X" must NOT be visible, or it would turn
   *    "destroy 1 card if you control a Dragon" into a TRIGGER effect;
   *  - a trailing window ("You can destroy 1 card *during your Main Phase*")
   *    genuinely IS the activation window, so hiding it would misclassify a
   *    perfectly ordinary ignition effect as static.
   */
  const classifyConditions = [
    ...conditions,
    ...trailingConditions.filter((c) => c.kind === ConditionKind.TIMING),
  ];

  const classifyInput: ClassifyInput = {
    conditions: classifyConditions,
    hasActivationPunctuation:
      parts.hasActivationPunctuation ||
      (inherited?.hasActivationPunctuation ?? false),
    legacyCondition: parts.legacyCondition,
    hasSummonCondition: false,
    modifiersOnly: modifiersOnly(resolution),
    isFlip,
  };

  // Pre-PSCT text is worth flagging: its structure is recovered from a comma
  // rather than a colon, so a consumer should treat its clause split as weaker
  // evidence than a modern card's.
  if (parts.legacyCondition) {
    diagnostics.push({
      severity: DiagnosticSeverity.INFO,
      code: DiagnosticCode.LEGACY_TEXT,
      message:
        'Condition recovered from a comma; this printing predates PSCT punctuation.',
      span,
    });
  }

  const effect: ParsedEffect = {
    id: `${input.blockIndex}.${input.sentenceIndex}`,
    blockKind: input.blockKind,
    effectKind: classify(classifyInput, ctx),
    condition: [
      ...applyMissesTiming(conditions, optional),
      ...trailingConditions,
    ],
    activation,
    resolution,
    restrictions,
    optional,
    sourceText: sentenceText,
    span,
    diagnostics,
    confidence: 1,
  };

  const startsChainValue = startsChain(classifyInput, ctx);
  if (startsChainValue !== undefined) effect.startsChain = startsChainValue;

  // References resolve against the finished effect, because a pronoun in the
  // resolution points at a target declared in the activation.
  effect.diagnostics.push(...resolveReferences(effect, input.priorEffects));

  // Only now can a pronoun object be judged, so `resolved` is recomputed here
  // rather than trusted from the visitor.
  refreshResolved(effect.resolution);

  effect.confidence = scoreEffect(effect);

  // A sentence that produced no structure at all is only worth keeping when it
  // said something: a condition, a restriction, or a classification. Otherwise
  // it is noise, and an empty effect would be a fact the card does not state.
  const saysSomething =
    resolution !== null ||
    activation.length > 0 ||
    conditions.length > 0 ||
    trailingConditions.length > 0 ||
    restrictions.labels.length > 0 ||
    restrictions.hardOncePerTurn !== undefined ||
    restrictions.softOncePerTurn === true;

  if (saysSomething) return effect;

  // The sentence produced nothing. Carry its diagnostics up to the card, and
  // say so explicitly when the text looked like an effect — a sentence with a
  // verb or a selection in it that yields no structure is a template gap, not
  // an empty sentence.
  input.dropped.push(...effect.diagnostics);

  if (LOOKS_LIKE_EFFECT_RE.test(sentenceText)) {
    input.dropped.push({
      severity: DiagnosticSeverity.WARNING,
      code: DiagnosticCode.TEMPLATE_NOT_SUPPORTED,
      message: `Sentence looked like an effect but produced no structure: ${sentenceText}`,
      span,
    });
  }

  return null;
}
