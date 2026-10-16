/**
 * The corpus loader.
 *
 * Card text lives in `corpus/*.json` as real printed text, grouped by the kind
 * of difficulty it presents. Loaded with `fs` rather than `import` on purpose:
 * a JSON default-import depends on `esModuleInterop`, which this project does
 * not enable, and reading the files explicitly keeps the corpus usable from
 * both Jest and a `tsx` script without any compiler-option coupling.
 *
 * Paths resolve against `__dirname`, so the loader works from the repo root or
 * from anywhere else the test runner is invoked.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CorpusEntry {
  /** The card's name, which doubles as the test label. */
  name: string;
  /** The printed effect text, verbatim. */
  text: string;
  cardType: 'MONSTER' | 'SPELL' | 'TRAP';
  spellTrapSubType?: string;
}

/**
 * The corpus groups, in increasing difficulty.
 *
 * `known-problem-cases` is the important one: it holds the text that has
 * actually broken a parser — names containing structural punctuation, quoted
 * effects that describe what a card negates, Summon conditions full of verbs.
 */
export const CORPUS_GROUPS = [
  'simple-costs',
  'targeting',
  'conjunctions',
  'trigger-effects',
  'continuous-effects',
  'legacy-text',
  'known-problem-cases',
  'references-and-trailing',
] as const;

export type CorpusGroup = (typeof CORPUS_GROUPS)[number];

export function loadGroup(group: CorpusGroup): CorpusEntry[] {
  const path = join(__dirname, 'corpus', `${group}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as CorpusEntry[];
}

export function loadCorpus(): Record<CorpusGroup, CorpusEntry[]> {
  return Object.fromEntries(
    CORPUS_GROUPS.map((group) => [group, loadGroup(group)]),
  ) as Record<CorpusGroup, CorpusEntry[]>;
}
