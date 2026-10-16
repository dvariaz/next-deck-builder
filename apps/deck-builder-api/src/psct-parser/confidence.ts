/**
 * Confidence scoring.
 *
 * A single number is a blunt instrument, and it is NOT the primary signal in
 * this parser — `diagnostics` and the per-action `resolved` flag are, because
 * they say what is wrong rather than merely how much. Confidence exists so a
 * review queue can be sorted and so corpus metrics have a trend line to track.
 *
 * It is therefore DERIVED, never invented: every deduction traces to a concrete
 * diagnostic or an unresolved node. Nothing here estimates how plausible a
 * parse "feels".
 */

import { DiagnosticSeverity } from './ast';
import type { Diagnostic, EffectNode, ParsedEffect } from './ast';

/**
 * Per-severity deductions.
 *
 * An error means a stage failed outright, so it costs most. A warning means
 * something was recognised but not pinned down. Info costs nothing: a curly
 * quote being normalized is worth recording and worth nothing as a penalty.
 */
const SEVERITY_COST: Record<DiagnosticSeverity, number> = {
  [DiagnosticSeverity.ERROR]: 0.4,
  [DiagnosticSeverity.WARNING]: 0.15,
  [DiagnosticSeverity.INFO]: 0,
};

/** Deduction for an action whose verb or object could not be pinned down. */
const UNRESOLVED_ACTION_COST = 0.2;

/** Count the actions under a node, and how many are resolved. */
function tally(node: EffectNode | null): { total: number; resolved: number } {
  if (!node) return { total: 0, resolved: 0 };

  switch (node.kind) {
    case 'action':
      return { total: 1, resolved: node.resolved ? 1 : 0 };
    case 'modifier':
      // A modifier makes no reachability claim, so it is neither a resolved nor
      // an unresolved action; it simply does not participate.
      return { total: 0, resolved: 0 };
    case 'conditional': {
      // The condition half of a conditional is a repeat of the preceding node
      // rather than a further action, so only `then` is counted.
      return tally(node.then);
    }
    case 'sequence':
    case 'parallel': {
      return node.children.reduce(
        (acc, child) => {
          const t = tally(child);
          return {
            total: acc.total + t.total,
            resolved: acc.resolved + t.resolved,
          };
        },
        { total: 0, resolved: 0 },
      );
    }
  }
}

/**
 * Score one effect.
 *
 * Returns a value in [0, 1]. An effect with no diagnostics and every action
 * resolved scores 1; one that failed to parse at all scores near 0.
 */
export function scoreEffect(
  effect: Pick<ParsedEffect, 'diagnostics' | 'resolution'>,
): number {
  let score = 1;

  for (const diagnostic of effect.diagnostics) {
    score -= SEVERITY_COST[diagnostic.severity];
  }

  const { total, resolved } = tally(effect.resolution);
  if (total > 0) {
    score -= ((total - resolved) / total) * UNRESOLVED_ACTION_COST;
  }

  return clamp(score);
}

/**
 * Score a whole card as the MINIMUM of its effects, not the mean.
 *
 * A card is only as trustworthy as its least trustworthy effect: averaging
 * would let four clean sentences hide one that parsed wrongly, which is exactly
 * the failure the review queue exists to catch.
 */
export function scoreCard(
  effects: readonly Pick<ParsedEffect, 'confidence'>[],
  cardDiagnostics: readonly Diagnostic[],
): number {
  const base =
    effects.length === 0 ? 1 : Math.min(...effects.map((e) => e.confidence));

  const penalty = cardDiagnostics.reduce(
    (acc, d) => acc + SEVERITY_COST[d.severity],
    0,
  );

  return clamp(base - penalty);
}

function clamp(value: number): number {
  // Rounded to three places so stored scores compare equal across runs rather
  // than differing in float noise.
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}
