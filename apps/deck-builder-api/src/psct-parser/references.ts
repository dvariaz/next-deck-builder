/**
 * Stage 7b — reference resolution.
 *
 * A separate pass over the finished AST, not something the visitor can do
 * inline, because a pronoun's antecedent is usually in a DIFFERENT clause from
 * the action that uses it. Modern PSCT states the selection in the activation
 * half and refers back to it in the resolution:
 *
 *     Target 1 monster in your GY; Special Summon it.
 *     ^^^^^^^^^^^^^^^^^^^^^^^^^^^  antecedent
 *                                  ^^^^^^^^^^^^^^^^^ reference
 *
 * Pre-PSCT text goes further and splits the two across SENTENCES — "Select 1
 * monster on the field. Destroy it." — which is why the pass takes the effects
 * already parsed from the same block as additional candidates.
 *
 * The rule the parser holds to here is: never silently guess. A reference that
 * cannot be linked with confidence keeps `resolvedTo: null` and earns an
 * `UNRESOLVED_REFERENCE` diagnostic, because a wrong antecedent would attach a
 * real action to the wrong card — worse than reporting nothing.
 */

import { DiagnosticCode, DiagnosticSeverity, ReferenceExpression } from './ast';
import type {
  Diagnostic,
  EffectNode,
  ParsedEffect,
  ReferenceNode,
  TargetNode,
} from './ast';

/** Confidence for a reference linked to the only candidate available. */
const UNAMBIGUOUS = 1;
/** Confidence for a plural reference linked to a singular antecedent. */
const NUMBER_MISMATCH = 0.6;

/** Plural references, which expect a plural or multi-card antecedent. */
const PLURAL = new Set<string>([
  ReferenceExpression.THEM,
  ReferenceExpression.BOTH,
  ReferenceExpression.THOSE_CARDS,
]);

/** Walk every target node under an effect node tree. */
function* targetsIn(node: EffectNode | null): Generator<TargetNode> {
  if (!node) return;

  switch (node.kind) {
    case 'action':
      if (node.object) yield node.object;
      return;
    case 'modifier':
      if (node.object) yield node.object;
      return;
    case 'conditional':
      yield* targetsIn(node.condition);
      yield* targetsIn(node.then);
      return;
    case 'sequence':
    case 'parallel':
      for (const child of node.children) yield* targetsIn(child);
      return;
  }
}

/**
 * True when a target can serve as an antecedent.
 *
 * The rule is simply "anything that is not itself a pronoun", which avoids
 * chains of references pointing at each other. An `unresolved` target DOES
 * qualify: "destroy it" after "target 1 card your opponent controls" is a
 * confident link even though the thing linked to is only loosely described.
 * The looseness is already recorded on that target, and reporting it twice —
 * once as an unresolved subject, once as an unresolved reference — would make
 * the review queue double-count the same gap.
 */
function isAntecedent(target: TargetNode): boolean {
  return target.subject.kind !== 'reference';
}

/** Does this antecedent describe more than one card? */
function isPlural(target: TargetNode): boolean {
  if (target.quantity === 'any') return true;
  if (target.quantity.max > 1) return true;
  return target.subject.kind === 'named' && target.subject.names.length > 1;
}

/**
 * Resolve every reference in one effect, in place.
 *
 * Candidates are drawn from the activation half first and in source order,
 * because that is where PSCT declares the things a resolution refers back to.
 * Resolution-half targets are included after, so "destroy 1 monster, then
 * banish it" also links.
 */
export function resolveReferences(
  effect: ParsedEffect,
  priorEffects: readonly ParsedEffect[] = [],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const activationTargetsOf = (e: ParsedEffect) =>
    e.activation.filter((node): node is TargetNode => node.kind === 'target');

  const activationTargets = activationTargetsOf(effect);
  const resolutionTargets = [...targetsIn(effect.resolution)];

  // Candidates from earlier sentences in the same block come first, so a legacy
  // "Select 1 monster on the field. Destroy it." can link across the full stop.
  const priorTargets = priorEffects.flatMap((e) => [
    ...activationTargetsOf(e),
    ...targetsIn(e.resolution),
  ]);

  const candidates = [
    ...priorTargets,
    ...activationTargets,
    ...resolutionTargets,
  ].filter(isAntecedent);

  /** The target a `that target` reference may link to: a declared target only. */
  const declaredTargets = [...priorTargets, ...activationTargets].filter(
    (t) => isAntecedent(t) && t.selection !== 'none',
  );

  for (const target of resolutionTargets) {
    if (target.subject.kind !== 'reference') continue;
    const reference = target.subject.reference;

    /**
     * "this card" needs no antecedent — it IS the card bearing the effect — so
     * it resolves structurally rather than by search. Treating it like a
     * pronoun made every "This card cannot be destroyed by battle" report an
     * unresolved reference, which is noise rather than a real gap.
     */
    if (reference.expression === ReferenceExpression.THIS_CARD) {
      reference.resolvedTo = 'self';
      reference.confidence = UNAMBIGUOUS;
      target.subject = { kind: 'self' };
      continue;
    }

    const resolved = resolveOne(reference, candidates, declaredTargets);

    if (resolved) {
      reference.resolvedTo = resolved.target.id;
      reference.confidence = resolved.confidence;
      // A reference inherits what it points at, so a consumer can read the
      // action's reach without walking the reference chain itself.
      target.quantity = resolved.target.quantity;
      if (target.sourceZones.length === 0) {
        target.sourceZones = resolved.target.sourceZones;
      }
      if (target.selection === 'none') {
        target.selection = resolved.target.selection;
      }
      continue;
    }

    diagnostics.push({
      severity: DiagnosticSeverity.WARNING,
      code: DiagnosticCode.UNRESOLVED_REFERENCE,
      message: `The reference "${reference.span.text}" could not be confidently linked to a prior entity.`,
      span: reference.span,
    });
  }

  return diagnostics;
}

interface Resolution {
  target: TargetNode;
  confidence: number;
}

function resolveOne(
  reference: ReferenceNode,
  candidates: TargetNode[],
  declaredTargets: TargetNode[],
): Resolution | null {
  /**
   * "that target" has stricter requirements than "it": it may only refer to a
   * card the effect actually TARGETED. Linking it to a non-targeting selection
   * would claim the effect targets when it does not, which inverts how
   * targeting protection applies.
   */
  if (reference.expression === ReferenceExpression.THAT_TARGET) {
    if (declaredTargets.length === 1) {
      return { target: declaredTargets[0], confidence: UNAMBIGUOUS };
    }
    return null;
  }

  if (reference.expression === ReferenceExpression.ALL) {
    // "all" is a scope, not a back-reference; it has no antecedent to find.
    return null;
  }

  const usable = candidates.filter((c) => c.id !== undefined);
  if (usable.length === 0) return null;

  // The nearest preceding antecedent is the only one PSCT ever means. With
  // exactly one candidate that is unambiguous; with several, the last one
  // declared before this reference wins.
  const antecedent = lastBefore(usable, reference);
  if (!antecedent) return null;

  const plural = PLURAL.has(reference.expression);
  const confidence =
    plural && !isPlural(antecedent) ? NUMBER_MISMATCH : UNAMBIGUOUS;

  return { target: antecedent, confidence };
}

/**
 * The last candidate declared before the reference, by source position.
 *
 * Spans are original-text offsets, so comparing them orders the candidates the
 * way a reader encounters them — which is exactly the rule PSCT follows.
 */
function lastBefore(
  candidates: TargetNode[],
  reference: ReferenceNode,
): TargetNode | null {
  const before = candidates
    .filter((c) => c.span.start < reference.span.start)
    .sort((a, b) => a.span.start - b.span.start);

  if (before.length) return before[before.length - 1];

  // Nothing precedes it in the text. A reference with no antecedent before it
  // is not resolvable; returning a later candidate would be a guess.
  return null;
}
