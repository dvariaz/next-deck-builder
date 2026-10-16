/**
 * Corpus tests.
 *
 * The question these answer is not "does my favourite card parse" but "did this
 * change make the parser better or just differently wrong". Coverage bought by
 * raising the error count is not coverage, so the metrics are asserted and
 * snapshotted together.
 *
 * Card text in `corpus/*.json` is REAL printed text. Do not hand-tidy it: the
 * value of the corpus is that it carries Konami's actual inconsistencies.
 */

import { parseCard } from './index';
import { summarize } from './metrics';
import { DiagnosticSeverity } from './ast';
import type { ParsedCard, ParserContext } from './ast';
import { validateParsedCard } from './schema';

import { CORPUS_GROUPS, loadCorpus, type CorpusEntry } from './corpus';

const GROUPS = loadCorpus();

/**
 * The pool's vocabulary, as the live parser receives it from the database.
 * Kept small here so a spec failure points at the parser rather than at a
 * 650-entry fixture.
 */
const ARCHETYPES = new Set([
  'Qli',
  'Sangan',
  'HERO',
  'Elemental HERO',
  'Trickstar',
  'Number 39: Utopia',
]);

const RACES = new Set([
  'Warrior',
  'Dragon',
  'Spellcaster',
  'Fiend',
  'Plant',
  'Machine',
  'Zombie',
]);

function parseEntry(entry: CorpusEntry, index: number): ParsedCard {
  const ctx: ParserContext = {
    archetypes: ARCHETYPES,
    races: RACES,
    cardId: String(index),
    cardName: entry.name,
    cardType: entry.cardType,
    ...(entry.spellTrapSubType
      ? { spellTrapSubType: entry.spellTrapSubType }
      : {}),
  };
  return parseCard(entry.text, ctx);
}

const ALL_ENTRIES = Object.values(GROUPS).flat();
const ALL_PARSES = ALL_ENTRIES.map(parseEntry);

describe('corpus — every card parses without a hard failure', () => {
  it.each(ALL_ENTRIES.map((e, i) => [e.name, i] as const))(
    '%s produces no ERROR diagnostics',
    (_name, index) => {
      const card = ALL_PARSES[index];
      const errors = [
        ...card.diagnostics,
        ...card.effects.flatMap((e) => e.diagnostics),
      ].filter((d) => d.severity === DiagnosticSeverity.ERROR);

      expect(errors).toEqual([]);
    },
  );

  it.each(ALL_ENTRIES.map((e, i) => [e.name, i] as const))(
    '%s validates against the persisted schema',
    (_name, index) => {
      expect(validateParsedCard(ALL_PARSES[index])).toEqual({
        valid: true,
        errors: [],
      });
    },
  );
});

describe('corpus — metrics', () => {
  it('has no failed parses across the whole corpus', () => {
    const metrics = summarize(ALL_PARSES);

    // Currently every entry parses with no warnings at all; the assertion is on
    // `failed` rather than on that, so adding hard new text to the corpus
    // records a warning without breaking the build.

    // "Failed" means a stage could not complete. A card parsed WITH warnings is
    // a success with recorded gaps, which is the expected state for a lot of
    // real text and must not be conflated with a failure.
    expect(metrics.failed).toBe(0);
    expect(metrics.total).toBe(ALL_ENTRIES.length);
  });

  it('keeps average confidence above the regression floor', () => {
    const metrics = summarize(ALL_PARSES);

    // A floor rather than an exact value, set just under the current 0.948.
    // Ratchet it UP when the grammar improves; a drop below it means a change
    // traded correctness for coverage.
    expect(metrics.averageConfidence).toBeGreaterThan(0.9);
  });

  it('resolves most actions it reports', () => {
    const metrics = summarize(ALL_PARSES);

    // Unresolved actions are honest but useless to a search graph, so this is
    // the number that says whether the parser is actually paying off. Currently
    // ~0.71; the floor sits below that rather than at it, so an unrelated
    // corpus addition does not fail the build.
    expect(metrics.resolvedActionRate).toBeGreaterThan(0.65);
  });

  it('matches the recorded diagnostic profile', () => {
    const metrics = summarize(ALL_PARSES);

    // Snapshotted so any change in what the parser finds uncertain is visible
    // in review rather than discovered by a consumer.
    expect({
      total: metrics.total,
      parsedWithoutErrors: metrics.parsedWithoutErrors,
      parsedWithWarnings: metrics.parsedWithWarnings,
      failed: metrics.failed,
      diagnosticCounts: metrics.diagnosticCounts,
    }).toMatchSnapshot();
  });
});

describe.each(CORPUS_GROUPS)('corpus group — %s', (group) => {
  it('snapshots every parse in the group', () => {
    const parses = GROUPS[group].map((entry, i) => {
      const card = parseEntry(entry, i);
      return {
        name: entry.name,
        normalizedText: card.normalizedText,
        confidence: card.confidence,
        parserVersion: card.parserVersion,
        effects: card.effects.map((effect) => ({
          id: effect.id,
          blockKind: effect.blockKind,
          effectKind: effect.effectKind,
          optional: effect.optional,
          startsChain: effect.startsChain,
          condition: effect.condition,
          activation: effect.activation,
          resolution: effect.resolution,
          restrictions: effect.restrictions,
          diagnostics: effect.diagnostics,
          confidence: effect.confidence,
        })),
        diagnostics: card.diagnostics,
      };
    });

    expect(parses).toMatchSnapshot();
  });
});
