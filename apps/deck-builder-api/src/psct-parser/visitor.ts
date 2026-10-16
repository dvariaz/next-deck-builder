/**
 * Stages 5 and 6 — CST to semantic AST, and conjunction semantics.
 *
 * The concrete syntax tree is never persisted. It is shaped by the grammar's
 * convenience (which `OPTION` fired, which `SUBRULE` index matched) rather than
 * by the game, and storing it would couple every consumer to the grammar's
 * internals. This visitor converts it into the small semantic AST in `ast.ts`.
 *
 * The one piece of real game semantics applied here is the conjunction: Konami's
 * "then", "also", "and if you do" and "and" are operators that say whether a
 * later action happens at all when an earlier one fails. A `sequence` node means
 * ordered-and-dependent, a `parallel` node means simultaneous, and
 * `dependsOnPrevious` records the per-action consequence.
 */

import type { CstNode, IToken } from 'chevrotain';
import {
  ActionVerb,
  Conjunction,
  CostKind,
  DEPENDENT_CONJUNCTIONS,
  Destination,
  ModifierKind,
  SelectionMode,
  Stat as StatEnum,
} from './ast';
import type {
  ActionNode,
  CostNode,
  EffectNode,
  ModifierNode,
  ParserContext,
  Quantity,
  ReferenceExpression,
  Span,
  TargetNode,
  TargetSubject,
} from './ast';
import { hintOf, NumberLiteral, spanOfTokens, tokenFor } from './lexer';
import { TokenKind } from './lexicon';
import {
  labelOf,
  readDestination,
  readFilter,
  readQuantity,
  readSubject,
  readZones,
  isConstrained,
} from './filters';
import type { NormalizedText } from './normalize';

const StatTok = tokenFor(TokenKind.STAT);

/** Every token under a CST node, in source order. */
export function tokensUnder(node: CstNode | undefined): IToken[] {
  if (!node) return [];
  const out: IToken[] = [];

  const walk = (n: CstNode) => {
    for (const key of Object.keys(n.children)) {
      for (const child of n.children[key] ?? []) {
        if (child === undefined) continue;
        if ('children' in (child as CstNode)) {
          walk(child as CstNode);
        } else {
          out.push(child as IToken);
        }
      }
    }
  };

  walk(node);
  return out.sort((a, b) => a.startOffset - b.startOffset);
}

/** First child CST node under `key`, if the rule matched. */
function child(node: CstNode, key: string): CstNode | undefined {
  return node.children[key]?.[0] as CstNode | undefined;
}

/** All child CST nodes under `key`. */
function children(node: CstNode, key: string): CstNode[] {
  return (node.children[key] ?? []) as CstNode[];
}

/** First token child under `key`, if present. */
function token(node: CstNode, key: string): IToken | undefined {
  return node.children[key]?.[0] as IToken | undefined;
}

/** Context carried through one clause's conversion. */
export interface VisitContext {
  nt: NormalizedText;
  ctx: ParserContext;
  /** Monotonic counter behind `TargetNode.id`, unique within a parse. */
  nextId: () => string;
  /**
   * The selection mode declared anywhere in the enclosing clause.
   *
   * Modern PSCT states the target in the ACTIVATION half and refers back to it
   * in the resolution — "target 1 monster in your GY; Special Summon it" — so
   * an action's selection mode cannot be read from the resolution alone. The
   * pipeline fills this in from the whole clause before converting the
   * resolution.
   */
  clauseSelection: SelectionMode;
}

function spanOf(vc: VisitContext, node: CstNode | undefined): Span {
  return spanOfTokens(vc.nt, tokensUnder(node));
}

/** Map a lexicon hint onto an `ActionVerb`, or UNKNOWN. */
function verbFromHint(hint: string | undefined): ActionVerb {
  if (!hint) return ActionVerb.UNKNOWN;
  const match = Object.values(ActionVerb).find((v) => v === hint);
  return match ?? ActionVerb.UNKNOWN;
}

/**
 * Build the target node for an object phrase.
 *
 * A bare pronoun becomes a `reference` subject with `resolvedTo: null`;
 * `references.ts` links it to an antecedent afterwards, because the antecedent
 * is usually in a different clause than this one.
 */
function readObject(
  vc: VisitContext,
  objectPhrase: CstNode | undefined,
  selection: SelectionMode,
): TargetNode | null {
  if (!objectPhrase) return null;

  const referenceToken = token(
    objectPhrase,
    tokenFor(TokenKind.REFERENCE).name,
  );
  const span = spanOf(vc, objectPhrase);

  if (referenceToken) {
    const expression = (hintOf(referenceToken) ??
      'unknown') as ReferenceExpression;
    const subject: TargetSubject = {
      kind: 'reference',
      reference: {
        kind: 'reference',
        expression,
        resolvedTo: null,
        confidence: 0,
        span: spanOfTokens(vc.nt, [referenceToken]),
      },
    };
    return {
      kind: 'target',
      id: vc.nextId(),
      subject,
      quantity: { min: 1, max: 1 },
      selection,
      sourceZones: [],
      span,
    };
  }

  const nounPhrase = child(objectPhrase, 'nounPhrase');
  const tokens = tokensUnder(nounPhrase);

  return {
    kind: 'target',
    id: vc.nextId(),
    subject: readSubject(tokens, vc.ctx),
    quantity: readQuantity(tokens),
    selection,
    sourceZones: readZones(tokens),
    span,
  };
}

interface PrepParts {
  sourceZones: ReturnType<typeof readZones>;
  destination?: ReturnType<typeof readDestination>;
  /**
   * Tokens from a `with` phrase, which constrains the OBJECT rather than
   * describing the action: "1 monster with 1500 or less ATK" puts the ATK bound
   * outside the noun phrase, so without collecting it here the object would be
   * recorded as every monster in the game.
   */
  constraints: IToken[];
  /** Verbatim prepositional phrases that carried neither a zone nor a target. */
  leftovers: string[];
}

/**
 * Split prepositional phrases into source zones, destination, and leftovers.
 *
 * `from` names a source and `to` names a destination; those two carry the
 * difference between "add 1 monster from your Deck to your hand" and the same
 * sentence reading from the GY. Anything else ("with 1500 ATK", "by battle") is
 * kept verbatim rather than modelled, because inventing structure for it would
 * be guessing.
 */
function readPrepPhrases(vc: VisitContext, prepPhrases: CstNode[]): PrepParts {
  const parts: PrepParts = { sourceZones: [], constraints: [], leftovers: [] };

  for (const phrase of prepPhrases) {
    const prepToken = token(phrase, tokenFor(TokenKind.PREPOSITION).name);
    const hint = prepToken ? hintOf(prepToken) : undefined;
    // Every token under the phrase except the preposition itself. Read this way
    // rather than via a named child, because the object may be either a
    // `nounPhrase` or a bare `Reference`.
    const nounTokens = tokensUnder(phrase).filter((t) => t !== prepToken);

    if (hint === 'from' || hint === 'in' || hint === 'on') {
      const zones = readZones(nounTokens);
      if (zones.length) {
        parts.sourceZones.push(...zones);
        continue;
      }
    }

    if (hint === 'to') {
      const destination = readDestination(nounTokens);
      if (destination) {
        parts.destination = destination;
        continue;
      }
    }

    // "with ..." describes the object, so keep its tokens for merging into the
    // object's filter rather than discarding them as prose.
    if (hint === 'with') {
      parts.constraints.push(...nounTokens);
      continue;
    }

    parts.leftovers.push(labelOf(tokensUnder(phrase)));
  }

  return parts;
}

/**
 * Fold a `with` phrase's constraints into the object it describes.
 *
 * Mutates in place, and extends the label so the displayed phrase stays the one
 * Konami printed: "1 monster" alone would be a misleading label for a search
 * that is actually restricted to 1500 ATK or less.
 *
 * An `unresolved` object is UPGRADED to `criteria` when the constraint alone is
 * enough to pin it down — "1 monster with 1500 or less ATK" is queryable even
 * though "1 monster" by itself is not.
 */
function applyConstraints(
  vc: VisitContext,
  object: TargetNode | null,
  constraints: IToken[],
): void {
  if (!object || constraints.length === 0) return;

  const extra = readFilter(constraints, vc.ctx);
  if (!isConstrained(extra)) return;

  const suffix = labelOf(constraints);

  if (object.subject.kind === 'criteria') {
    object.subject = {
      kind: 'criteria',
      filter: { ...object.subject.filter, ...extra },
      label: `${object.subject.label} with ${suffix}`.trim(),
    };
    return;
  }

  if (object.subject.kind === 'unresolved') {
    object.subject = {
      kind: 'criteria',
      filter: extra,
      label: `${object.subject.text} with ${suffix}`.trim(),
    };
  }
}

/** Read a magnitude for verbs that carry one ("inflict 200 damage"). */
function readAmount(tokens: IToken[]): number | 'variable' | null {
  const numbers = tokens.filter((t) => t.tokenType === NumberLiteral);
  if (numbers.length === 0) {
    // "damage equal to its ATK" and friends compute the value; saying
    // 'variable' is honest where a number would be fiction.
    const computed = /\bequal to\b|\bfor each\b|\bx\s?\d/i.test(
      labelOf(tokens),
    );
    return computed ? 'variable' : null;
  }
  return Number(numbers[0].image);
}

/**
 * Convert an `actionClause` CST node.
 *
 * `resolved` is set only when the verb is known AND the object is pinned down.
 * Consumers that draw graph edges filter on it, so the bar is deliberately
 * high: a declined action costs a feature, a wrong one costs trust.
 */
export function readActionClause(
  vc: VisitContext,
  node: CstNode,
  link: Linkage,
): ActionNode {
  const verbToken = token(node, tokenFor(TokenKind.VERB).name);
  const verb = verbFromHint(verbToken ? hintOf(verbToken) : undefined);
  const objectPhrase = child(node, 'objectPhrase');
  const object = readObject(vc, objectPhrase, vc.clauseSelection);
  const preps = readPrepPhrases(vc, children(node, 'prepPhrase'));
  const allTokens = tokensUnder(node);

  // "Set" writes face-down; every other field-bound verb writes face-up. The
  // zone cannot say which, so the verb does.
  const destination =
    verb === ActionVerb.SET && preps.destination === Destination.FIELD_FACE_UP
      ? Destination.FIELD_FACE_DOWN
      : preps.destination;

  applyConstraints(vc, object, preps.constraints);

  // "add 1 monster FROM YOUR DECK to your hand" states the object's zone in a
  // prepositional phrase, not inside the noun phrase, so the zones read off the
  // prepositions belong to the object. Without this the action knows what it
  // fetches but not where from, which is half the fact a search graph needs.
  if (object && object.sourceZones.length === 0 && preps.sourceZones.length) {
    object.sourceZones = preps.sourceZones;
  }

  return {
    kind: 'action',
    verb,
    object,
    ...(destination ? { destination } : {}),
    // A magnitude is only meaningful for the verbs that carry one instead of an
    // object ("inflict 200 damage", "draw 2 cards").
    amount: VERBS_WITHOUT_OBJECT.includes(verb) ? readAmount(allTokens) : null,
    modifiers: preps.leftovers,
    conjunction: link.conjunction,
    dependsOnPrevious: link.dependsOnPrevious,
    // Provisional. A pronoun object cannot be judged yet — `references.ts` has
    // not run — so the pipeline recomputes this with `refreshResolved` once
    // antecedents are linked. See `isTargetPinnedDown`.
    resolved: isActionResolved(verb, object),
    span: spanOf(vc, node),
  };
}

/**
 * Verbs that are fully understood with no object at all.
 *
 * "draw 2 cards" and "end the Battle Phase" name no card, so having no object
 * is not a gap in them.
 */
const VERBS_WITHOUT_OBJECT: readonly ActionVerb[] = [
  ActionVerb.DRAW,
  ActionVerb.END_BATTLE_PHASE,
  ActionVerb.INFLICT_DAMAGE,
  ActionVerb.TAKE_DAMAGE,
  ActionVerb.GAIN_LP,
  ActionVerb.LOSE_LP,
  ActionVerb.TOSS_COIN,
  ActionVerb.ROLL_DICE,
];

/**
 * Is this target pinned down well enough for a consumer to query on it?
 *
 * The `reference` case is the one worth spelling out: a pronoun whose
 * antecedent has been RESOLVED is pinned down, because the thing it points at
 * is. "target 1 Spell/Trap on the field; destroy it" knows exactly what it
 * destroys. Treating every pronoun as unresolved understated the parser badly —
 * it is the difference between reporting a search edge and silently dropping
 * it. An UNresolved reference stays false, and carries its own diagnostic.
 */
export function isTargetPinnedDown(target: TargetNode | null): boolean {
  if (target === null) return false;
  const subject = target.subject;

  switch (subject.kind) {
    case 'named':
    case 'self':
      return true;
    case 'criteria':
      return isConstrained(subject.filter);
    case 'reference':
      return subject.reference.resolvedTo !== null;
    case 'unresolved':
      return false;
  }
}

/** Whether an action is fully understood, given its current object state. */
export function isActionResolved(
  verb: ActionVerb,
  object: TargetNode | null,
): boolean {
  if (verb === ActionVerb.UNKNOWN) return false;
  if (VERBS_WITHOUT_OBJECT.includes(verb)) return true;
  return isTargetPinnedDown(object);
}

/**
 * Recompute `resolved` across an effect node tree, in place.
 *
 * Called after reference resolution, which is the point at which a pronoun
 * object becomes judgeable. Without this pass every "destroy it" stays
 * `resolved: false` however precisely the text identified its antecedent.
 */
export function refreshResolved(node: EffectNode | null): void {
  if (!node) return;

  switch (node.kind) {
    case 'action':
      node.resolved = isActionResolved(node.verb, node.object);
      return;
    case 'modifier':
      return;
    case 'conditional':
      refreshResolved(node.condition);
      refreshResolved(node.then);
      return;
    case 'sequence':
    case 'parallel':
      for (const child of node.children) refreshResolved(child);
      return;
  }
}

/** Lexicon modifier hints that map straight onto a `ModifierKind`. */
const MODIFIER_KINDS: ReadonlyMap<string, ModifierKind> = new Map([
  ['indestructible', ModifierKind.INDESTRUCTIBLE],
  ['indestructible_battle', ModifierKind.INDESTRUCTIBLE],
  ['indestructible_effect', ModifierKind.INDESTRUCTIBLE],
  ['untargetable', ModifierKind.UNTARGETABLE],
  ['unaffected', ModifierKind.UNAFFECTED],
  ['cannot_attack', ModifierKind.CANNOT_ATTACK],
  ['cannot_attack_directly', ModifierKind.CANNOT_ATTACK],
  ['can_attack_directly', ModifierKind.CAN_ATTACK_DIRECTLY],
  ['must_attack', ModifierKind.MUST_ATTACK],
  ['cannot_change_position', ModifierKind.CANNOT_CHANGE_POSITION],
  ['cannot_be_tributed', ModifierKind.CANNOT_BE_TRIBUTED],
  ['cannot_be_banished', ModifierKind.CANNOT_BE_BANISHED],
  ['treated_as', ModifierKind.TREATED_AS],
]);

/** A duration phrase, kept verbatim and never modelled further. */
const DURATION_RE =
  /\b(?:until the (?:End Phase|end of (?:this|your|your opponent's) turn)|this turn|during (?:this|your|either player's) turn|while this card (?:is|remains)[^,.;]*)/i;

/**
 * Convert a `modifierClause` CST node.
 *
 * Returns either a continuous `ModifierNode` or a discrete `ActionNode`: the
 * words "gain" and "lose" are both, and only the stat they govern says which.
 * "monsters you control gain 300 ATK" is a continuous state; "you gain 500 LP"
 * is a one-off action that changes a total. Deciding here rather than in the
 * lexer is the point — this is the first place with enough context to tell.
 */
export function readModifierClause(
  vc: VisitContext,
  node: CstNode,
  link: Linkage,
): ModifierNode | ActionNode {
  const modifierToken = token(node, tokenFor(TokenKind.MODIFIER).name);
  const hint = modifierToken ? hintOf(modifierToken) : undefined;
  const subjectPhrase = child(node, 'subject');
  const complementPhrase = child(node, 'complement');
  const complementTokens = tokensUnder(complementPhrase);
  const allTokens = tokensUnder(node);
  const span = spanOf(vc, node);

  // The stat is usually in the complement ("gains 500 ATK"), but a POSSESSIVE
  // subject puts it in the subject instead ("This card's ATK becomes 2400").
  // Without the fallback the clause parses and then silently loses WHICH stat
  // changed, leaving an amount with nothing to attach to.
  const subjectTokens = tokensUnder(subjectPhrase);
  const statToken =
    complementTokens.find((t) => t.tokenType === StatTok) ??
    subjectTokens.find((t) => t.tokenType === StatTok);
  const statHint = statToken ? hintOf(statToken) : undefined;

  // The LP case: "gain"/"lose" with LP as the stat is a discrete action.
  if ((hint === 'gain' || hint === 'lose') && statHint === 'lp') {
    return {
      kind: 'action',
      verb: hint === 'gain' ? ActionVerb.GAIN_LP : ActionVerb.LOSE_LP,
      object: null,
      amount: readAmount(complementTokens),
      modifiers: [],
      conjunction: link.conjunction,
      dependsOnPrevious: link.dependsOnPrevious,
      resolved: true,
      span,
    };
  }

  const object = readObject(vc, subjectPhrase, SelectionMode.NONE);

  // "All FIRE monsters ON THE FIELD gain 500 ATK" states the subject's zone in
  // a prepositional phrase ahead of the modifier, so it belongs to the subject.
  const subjectPreps = readPrepPhrases(vc, children(node, 'subjectPrep'));
  if (
    object &&
    object.sourceZones.length === 0 &&
    subjectPreps.sourceZones.length
  ) {
    object.sourceZones = subjectPreps.sourceZones;
  }
  applyConstraints(vc, object, subjectPreps.constraints);

  const durationMatch = DURATION_RE.exec(labelOf(allTokens));

  if (hint === 'gain' || hint === 'lose' || hint === 'becomes') {
    const stat = Object.values(StatEnum).find((s) => s === statHint);
    return {
      kind: 'modifier',
      // A STAT modifier with no stat would be a wrong classification, not just
      // an incomplete one: "this card's name becomes "Umi"" changes a property
      // the IR does not model, so it is OTHER. The verbatim sourceText still
      // carries what the card said.
      modifier: stat ? ModifierKind.STAT : ModifierKind.OTHER,
      object,
      ...(stat ? { stat } : {}),
      mode: hint === 'becomes' ? 'becomes' : hint,
      // Omitted rather than coerced. Defaulting a missing amount to 'variable'
      // claimed the text COMPUTED a value, which is a wrong fact for clauses
      // that change something non-numeric at all ("this card's name becomes
      // "Umi""). `readAmount` already returns 'variable' where the text really
      // does compute one.
      ...(() => {
        const amount = readAmount(complementTokens);
        return amount === null ? {} : { amount };
      })(),
      ...(durationMatch ? { duration: durationMatch[0] } : {}),
      span,
    };
  }

  const modifier =
    (hint ? MODIFIER_KINDS.get(hint) : undefined) ?? ModifierKind.OTHER;

  return {
    kind: 'modifier',
    modifier,
    object,
    ...(durationMatch ? { duration: durationMatch[0] } : {}),
    span,
  };
}

/** Cost verbs, by the hint their verb token carries. */
const COST_KINDS: ReadonlyMap<string, CostKind> = new Map([
  ['discard', CostKind.DISCARD],
  ['tribute', CostKind.TRIBUTE],
  ['banish', CostKind.BANISH],
  ['detach', CostKind.DETACH],
  ['pay_life_points', CostKind.PAY_LIFE_POINTS],
  ['send', CostKind.SEND_TO_GY],
  ['shuffle', CostKind.SHUFFLE_INTO_DECK],
  ['return', CostKind.RETURN_TO_HAND],
  ['reveal', CostKind.REVEAL],
]);

/**
 * Convert an action clause that sits in the ACTIVATION half into a cost.
 *
 * Classification is by position, not by verb: the same "Send 1 monster from
 * your hand to the GY" is a cost before the semicolon and an action after it.
 * That is why `CostKind` and `ActionVerb` overlap rather than being disjoint
 * vocabularies.
 */
export function readCostClause(vc: VisitContext, node: CstNode): CostNode {
  const verbToken = token(node, tokenFor(TokenKind.VERB).name);
  const hint = verbToken ? hintOf(verbToken) : undefined;
  const objectPhrase = child(node, 'objectPhrase');
  const objectTokens = tokensUnder(objectPhrase);
  const preps = readPrepPhrases(vc, children(node, 'prepPhrase'));

  const quantity: Quantity = readQuantity(objectTokens);
  const amount =
    hint === 'pay_life_points'
      ? readAmount(tokensUnder(node))
      : quantity === 'any'
        ? 'any'
        : quantity.max;

  const subject =
    objectTokens.length > 0 ? readSubject(objectTokens, vc.ctx) : null;

  return {
    kind: 'cost',
    cost: (hint ? COST_KINDS.get(hint) : undefined) ?? CostKind.OTHER,
    amount: amount ?? null,
    subject,
    sourceZones: preps.sourceZones,
    span: spanOf(vc, node),
  };
}

/** The selection mode a `targetClause` declares. */
function selectionFromTargetVerb(node: CstNode): SelectionMode {
  const verbToken = token(node, tokenFor(TokenKind.TARGET_VERB).name);
  const hint = verbToken ? hintOf(verbToken) : undefined;
  if (hint === 'target') return SelectionMode.TARGET;
  if (hint === 'choose') return SelectionMode.CHOOSE;
  if (hint === 'legacy_select') return SelectionMode.LEGACY_SELECT;
  return SelectionMode.NONE;
}

/** Convert a `targetClause` into the target it declares. */
export function readTargetClause(vc: VisitContext, node: CstNode): TargetNode {
  const selection = selectionFromTargetVerb(node);
  const objectPhrase = child(node, 'objectPhrase');
  const preps = readPrepPhrases(vc, children(node, 'prepPhrase'));

  const target =
    readObject(vc, objectPhrase, selection) ??
    ({
      kind: 'target',
      id: vc.nextId(),
      subject: { kind: 'unresolved', text: labelOf(tokensUnder(node)) },
      quantity: { min: 1, max: 1 },
      selection,
      sourceZones: [],
      span: spanOf(vc, node),
    } satisfies TargetNode);

  applyConstraints(vc, target, preps.constraints);

  // A target's zone is usually stated in a prepositional phrase ("in your GY"),
  // not inside the noun phrase.
  if (preps.sourceZones.length && target.sourceZones.length === 0) {
    target.sourceZones = preps.sourceZones;
  }
  target.span = spanOf(vc, node);

  return target;
}

/** The conjunction a single token declares, defaulting to NONE. */
function conjunctionOf(conjunctionToken: IToken | undefined): Conjunction {
  const hint = conjunctionToken ? hintOf(conjunctionToken) : undefined;
  const match = Object.values(Conjunction).find((c) => c === hint);
  return match ?? Conjunction.NONE;
}

/**
 * How a tail action is joined to what precedes it.
 *
 * A separator can hold SEVERAL conjunctions ("also, after that"), which is why
 * this is a run rather than one value.
 */
export interface Linkage {
  /** Every conjunction in the run, in printed order. */
  run: Conjunction[];
  /**
   * The one recorded on the action: the NEAREST, since it is the one directly
   * introducing it.
   */
  conjunction: Conjunction;
  /**
   * True when ANY conjunction in the run is dependent.
   *
   * The stricter reading on purpose. "also" alone is independent and "after
   * that" alone is sequential; stacked, the safe claim is that the action does
   * not happen if what precedes it failed. Over-claiming independence would
   * assert reachability the text does not promise.
   */
  dependsOnPrevious: boolean;
}

const NO_LINKAGE: Linkage = {
  run: [],
  conjunction: Conjunction.NONE,
  dependsOnPrevious: false,
};

/** Build a linkage from the conjunction tokens of a separator run. */
export function linkageFromTokens(tokens: readonly IToken[]): Linkage {
  const run = tokens.map(conjunctionOf).filter((c) => c !== Conjunction.NONE);
  if (run.length === 0) return NO_LINKAGE;

  return {
    run,
    conjunction: run[run.length - 1],
    dependsOnPrevious: run.some((c) => DEPENDENT_CONJUNCTIONS.includes(c)),
  };
}

/** Read the conjunction run out of one `separator` CST node. */
function linkageOf(separator: CstNode | undefined): Linkage {
  return linkageFromTokens(
    (separator?.children[tokenFor(TokenKind.CONJUNCTION).name] ??
      []) as IToken[],
  );
}

/** One conjunct that parsed, with how it is joined to what precedes it. */
export interface LinkedNode {
  node: EffectNode;
  link: Linkage;
}

/**
 * Assemble parsed conjuncts into one resolution tree.
 *
 * Shared by the whole-clause path and the segment-recovery path, so both
 * produce the same shape and the conjunction semantics live in one place:
 *
 *  - a single conjunct is returned bare;
 *  - `and if you do` wraps its conjunct in a `conditional` on the preceding one;
 *  - any sequential conjunction in the run makes the whole thing a `sequence`,
 *    otherwise it is `parallel`.
 */
export function assembleResolution(
  parts: readonly LinkedNode[],
  span: Span,
): EffectNode | null {
  const nodes: EffectNode[] = [];
  const allConjunctions: Conjunction[] = [];

  for (const { node, link } of parts) {
    allConjunctions.push(...link.run);

    // Checked across the whole run, not just the nearest: "and if you do, then
    // X" still makes X conditional on the preceding conjunct succeeding.
    if (link.run.includes(Conjunction.AND_IF_YOU_DO) && nodes.length) {
      nodes.push({
        kind: 'conditional',
        condition: nodes[nodes.length - 1],
        then: node,
        span: node.span,
      });
      continue;
    }
    nodes.push(node);
  }

  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];

  const isSequential = allConjunctions.some(
    (c) => c === Conjunction.THEN || c === Conjunction.AFTER_THAT,
  );

  return isSequential
    ? { kind: 'sequence', simultaneous: false, children: nodes, span }
    : { kind: 'parallel', simultaneous: true, children: nodes, span };
}

/** Convert one `actionGroup` CST, parsed on its own, into an effect node. */
export function readSegment(
  vc: VisitContext,
  group: CstNode,
  link: Linkage,
): EffectNode | null {
  return readActionGroup(vc, group, link);
}

/**
 * Convert one `actionGroup` into an effect node.
 *
 * A group is either an action or a modifier clause; the grammar guarantees
 * exactly one of them matched.
 */
function readActionGroup(
  vc: VisitContext,
  group: CstNode,
  link: Linkage,
): EffectNode | null {
  const action = child(group, 'actionClause');
  if (action) return readActionClause(vc, action, link);

  const modifier = child(group, 'modifierClause');
  if (modifier) return readModifierClause(vc, modifier, link);

  return null;
}

/**
 * Convert a `resolutionClause` into an `EffectNode` tree.
 *
 * The node kind encodes the conjunction semantics:
 *
 *  - a single group is returned bare, with no wrapper;
 *  - groups joined only by simultaneous conjunctions become a `parallel` node;
 *  - anything containing a sequential conjunction becomes a `sequence` node,
 *    because order then matters to whether the later part happens at all.
 *
 * `and if you do` additionally wraps its own group in a `conditional`, since it
 * states a dependency on the preceding group's success rather than merely an
 * order.
 */
export function readResolution(
  vc: VisitContext,
  resolutionClause: CstNode,
): EffectNode | null {
  const sequence = child(resolutionClause, 'actionSequence');
  if (!sequence) return null;

  const head = child(sequence, 'actionGroup');
  const tails = children(sequence, 'tail');
  // One separator per tail, each holding that tail's whole conjunction run.
  // Pairing by position is now safe; reading a flat token list was not.
  const separators = children(sequence, 'separator');

  const parts: LinkedNode[] = [];

  const headNode = head ? readActionGroup(vc, head, NO_LINKAGE) : null;
  if (headNode) parts.push({ node: headNode, link: NO_LINKAGE });

  tails.forEach((tail, i) => {
    const link = linkageOf(separators[i]);
    const node = readActionGroup(vc, tail, link);
    if (node) parts.push({ node, link });
  });

  return assembleResolution(parts, spanOf(vc, resolutionClause));
}

/**
 * Convert an `activationClause` into the costs and targets it declares.
 *
 * A modifier clause in the activation half is dropped rather than recorded: a
 * continuous state cannot be a cost, and the activation half is by definition
 * what is paid and committed to. Keeping it as a cost would invent a payment
 * the card does not demand.
 */
export function readActivation(
  vc: VisitContext,
  activationClause: CstNode,
): (CostNode | TargetNode)[] {
  const items = [
    ...children(activationClause, 'activationItem'),
    ...children(activationClause, 'tail'),
  ].sort(
    (a, b) =>
      (tokensUnder(a)[0]?.startOffset ?? 0) -
      (tokensUnder(b)[0]?.startOffset ?? 0),
  );

  const out: (CostNode | TargetNode)[] = [];

  for (const item of items) {
    const targetClause = child(item, 'targetClause');
    if (targetClause) {
      out.push(readTargetClause(vc, targetClause));
      continue;
    }

    const actionClause = child(item, 'actionClause');
    if (actionClause) {
      out.push(readCostClause(vc, actionClause));
    }
  }

  return out;
}

/** The selection mode declared anywhere in a clause's activation half. */
export function clauseSelectionOf(
  activationClause: CstNode | null,
): SelectionMode {
  if (!activationClause) return SelectionMode.NONE;

  const items = [
    ...children(activationClause, 'activationItem'),
    ...children(activationClause, 'tail'),
  ];

  for (const item of items) {
    const targetClause = child(item, 'targetClause');
    if (!targetClause) continue;
    const selection = selectionFromTargetVerb(targetClause);
    if (selection !== SelectionMode.NONE) return selection;
  }

  return SelectionMode.NONE;
}

export { readFilter };
