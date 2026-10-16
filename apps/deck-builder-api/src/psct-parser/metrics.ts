/**
 * Corpus metrics.
 *
 * The parser's progress is not measurable by "does it parse my favourite card".
 * These counters are, and they are what makes a grammar change defensible: a
 * rule that buys coverage by raising the error count has not helped.
 *
 * Tracked per parser version so a regression is visible as a trend rather than
 * discovered by a consumer.
 */

import { DiagnosticSeverity } from './ast';
import type { Diagnostic, ParsedCard } from './ast';

export interface CorpusMetrics {
  total: number;
  parsedWithoutErrors: number;
  parsedWithWarnings: number;
  failed: number;
  averageConfidence: number;
  diagnosticCounts: Record<string, number>;
  /** Share of actions that are fully pinned down, across the whole corpus. */
  resolvedActionRate: number;
  /**
   * Absolute action counts behind that rate.
   *
   * The rate alone is ambiguous and has already been misread once: a fix that
   * makes previously-unparseable clauses parse ADDS actions, some of them
   * unresolved, so the rate can fall while strictly more is understood. Always
   * read the rate together with these.
   */
  actionsTotal: number;
  actionsResolved: number;
  parserVersion: number;
}

function severityOf(diagnostics: readonly Diagnostic[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === DiagnosticSeverity.ERROR) errors++;
    else if (d.severity === DiagnosticSeverity.WARNING) warnings++;
  }
  return { errors, warnings };
}

/** Every diagnostic on a card, including the ones on its effects. */
function allDiagnostics(card: ParsedCard): Diagnostic[] {
  return [...card.diagnostics, ...card.effects.flatMap((e) => e.diagnostics)];
}

/** Count actions and resolved actions in a card, walking nested nodes. */
function actionTally(card: ParsedCard): { total: number; resolved: number } {
  let total = 0;
  let resolved = 0;

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as { kind?: string; [key: string]: unknown };

    if (n.kind === 'action') {
      total++;
      if (n.resolved === true) resolved++;
      return;
    }
    if (n.kind === 'conditional') {
      walk(n.then);
      return;
    }
    if (Array.isArray(n.children)) {
      for (const child of n.children) walk(child);
    }
  };

  for (const effect of card.effects) walk(effect.resolution);
  return { total, resolved };
}

/**
 * Summarise a corpus of parses.
 *
 * "Failed" means an ERROR diagnostic — a stage that could not complete — not
 * merely a card with gaps. A card parsed with warnings is a success with known
 * holes, and conflating the two would hide whether the parser is getting
 * better or just quieter.
 */
export function summarize(cards: readonly ParsedCard[]): CorpusMetrics {
  const diagnosticCounts: Record<string, number> = {};
  let parsedWithoutErrors = 0;
  let parsedWithWarnings = 0;
  let failed = 0;
  let confidenceSum = 0;
  let actionTotal = 0;
  let actionResolved = 0;

  for (const card of cards) {
    const diagnostics = allDiagnostics(card);
    for (const d of diagnostics) {
      diagnosticCounts[d.code] = (diagnosticCounts[d.code] ?? 0) + 1;
    }

    const { errors, warnings } = severityOf(diagnostics);
    if (errors > 0) failed++;
    else if (warnings > 0) parsedWithWarnings++;
    else parsedWithoutErrors++;

    confidenceSum += card.confidence;

    const tally = actionTally(card);
    actionTotal += tally.total;
    actionResolved += tally.resolved;
  }

  const round = (n: number) => Math.round(n * 1000) / 1000;

  return {
    total: cards.length,
    parsedWithoutErrors,
    parsedWithWarnings,
    failed,
    averageConfidence: cards.length ? round(confidenceSum / cards.length) : 1,
    diagnosticCounts,
    resolvedActionRate: actionTotal ? round(actionResolved / actionTotal) : 1,
    actionsTotal: actionTotal,
    actionsResolved: actionResolved,
    parserVersion: cards[0]?.parserVersion ?? 0,
  };
}
