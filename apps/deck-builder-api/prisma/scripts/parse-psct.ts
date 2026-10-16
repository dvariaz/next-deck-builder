/**
 * Batch-parse every card's effect text into `CardEffectParse`.
 *
 * Idempotent and version-aware, which is the whole point:
 *
 *   1. load the card pool and the vocabulary the parser needs;
 *   2. for each card, check whether a parse already exists for
 *      (cardId, PARSER_VERSION) and whether the card's text has changed since;
 *   3. parse only what is absent or outdated;
 *   4. validate against the Zod schema;
 *   5. persist the AST and its diagnostics.
 *
 * Two rules protect existing work:
 *
 *   - A row whose `origin` is not `rules` is NEVER overwritten unless `--force`
 *     is passed. That is what stops a future LLM or manual correction from being
 *     clobbered by a re-parse.
 *   - A parse that fails schema validation is NOT persisted. A malformed AST is
 *     worse than a missing one, because consumers cannot tell it apart from a
 *     correct one.
 *
 * Usage:
 *   yarn psct:parse            # parse what is missing or outdated
 *   yarn psct:parse --force    # re-parse everything, including non-rules rows
 *   yarn psct:parse --limit=50 # a sample, for checking a grammar change
 *   yarn psct:parse --dry-run  # parse and report, write nothing
 */

import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/client';
import { createPrismaAdapter } from '../prisma-adapter.factory';
import { parseCard } from '../../src/psct-parser';
import { PARSER_VERSION } from '../../src/psct-parser/ast';
import type { ParsedCard, ParserContext } from '../../src/psct-parser/ast';
import { summarize } from '../../src/psct-parser/metrics';
import { validateParsedCard } from '../../src/psct-parser/schema';

interface Options {
  force: boolean;
  dryRun: boolean;
  limit?: number;
}

function parseArgs(argv: string[]): Options {
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  return {
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    limit: limitArg ? Number(limitArg.split('=')[1]) : undefined,
  };
}

/** The dominant effect kind of a card, denormalized for filtering. */
function dominantEffectKind(parsed: ParsedCard): string {
  if (parsed.effects.length === 0) return 'unknown';
  // The first effect is the card's primary one in every layout: Pendulum halves
  // and bullet lists are ordered as printed.
  return parsed.effects[0].effectKind;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

  try {
    // The parser's vocabulary comes from the pool itself rather than a
    // hardcoded list, so a new archetype or monster Type needs no code change.
    const [archetypeRows, raceRows] = await Promise.all([
      prisma.card.findMany({
        where: { archetype: { not: null } },
        select: { archetype: true },
        distinct: ['archetype'],
      }),
      prisma.card.findMany({
        where: { cardType: 'MONSTER', race: { not: null } },
        select: { race: true },
        distinct: ['race'],
      }),
    ]);

    const archetypes = new Set(
      archetypeRows.map((r) => r.archetype).filter((a): a is string => !!a),
    );
    const races = new Set(
      raceRows
        .map((r) => r.race)
        .filter((r): r is string => !!r && r.length > 0),
    );

    const cards = await prisma.card.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        cardType: true,
        spellTrapSubType: true,
      },
      orderBy: { id: 'asc' },
      ...(options.limit ? { take: options.limit } : {}),
    });

    // Existing parses at this version, so the run can skip what is already done
    // without a query per card.
    const existing = await prisma.cardEffectParse.findMany({
      where: { parserVersion: PARSER_VERSION },
      select: { id: true, cardId: true, origin: true, sourceText: true },
    });
    const existingByCard = new Map(existing.map((e) => [e.cardId, e]));

    // Which cards already carry the denormalized column. A card can have a
    // current table row but a null column (the column was added later), and in
    // that case there IS work to do even though the row looks up to date.
    // Selected as ids only — the column itself is ~22 MB across the pool.
    const columnFilled = new Set(
      (
        await prisma.card.findMany({
          where: { parsedEffects: { not: null } },
          select: { id: true },
        })
      ).map((c) => c.id),
    );

    console.log(
      `Parser version ${PARSER_VERSION}: ${cards.length} cards, ` +
        `${existing.length} already parsed at this version.`,
    );

    const parses: ParsedCard[] = [];
    let written = 0;
    let skippedUpToDate = 0;
    let skippedProtected = 0;
    let skippedInvalid = 0;

    for (const card of cards) {
      const prior = existingByCard.get(card.id);

      if (prior && !options.force) {
        // A non-rules origin is protected work. Leave it alone.
        if (prior.origin !== 'rules') {
          skippedProtected++;
          continue;
        }
        // Up to date only if the TEXT also matches: a reseed can change a
        // card's printed text, and a parse of text that no longer exists is
        // stale even though its version is current.
        if (
          prior.sourceText === card.description &&
          columnFilled.has(card.id)
        ) {
          skippedUpToDate++;
          continue;
        }
      }

      const ctx: ParserContext = {
        archetypes,
        races,
        cardId: String(card.id),
        cardName: card.name,
        cardType: card.cardType,
        ...(card.spellTrapSubType
          ? { spellTrapSubType: card.spellTrapSubType }
          : {}),
      };

      const parsed = parseCard(card.description, ctx);
      parses.push(parsed);

      const validation = validateParsedCard(parsed);
      if (!validation.valid) {
        skippedInvalid++;
        console.warn(
          `  ! ${card.name}: schema validation failed, not persisted — ` +
            validation.errors.slice(0, 2).join('; '),
        );
        continue;
      }

      if (options.dryRun) continue;

      // One transaction per card: a parse and its diagnostics are a unit, and a
      // partial write would leave diagnostics attached to nothing.
      await prisma.$transaction(async (tx) => {
        await tx.cardEffectParse.deleteMany({
          where: { cardId: card.id, parserVersion: PARSER_VERSION },
        });

        const row = await tx.cardEffectParse.create({
          data: {
            cardId: card.id,
            sourceText: parsed.sourceText,
            effectKind: dominantEffectKind(parsed),
            ast: parsed as unknown as object,
            confidence: parsed.confidence,
            parserVersion: parsed.parserVersion,
            origin: parsed.origin,
          },
          select: { id: true },
        });

        const diagnostics = [
          ...parsed.diagnostics,
          ...parsed.effects.flatMap((e) => e.diagnostics),
        ];

        if (diagnostics.length) {
          await tx.cardEffectDiagnostic.createMany({
            data: diagnostics.map((d) => ({
              parseId: row.id,
              severity: d.severity,
              code: d.code,
              message: d.message,
              span: d.span ?? undefined,
            })),
          });
        }

        // Denormalize the current parse onto the card row. This is what makes
        // reads pure reads: `/cards` and `/cards/:id/effects` serve it with no
        // join and no parsing, so nothing is ever computed at read time. The
        // table above stays the version-keyed history and the review queue.
        //
        // No separate timestamp column: `parsedAt` is inside the object, along
        // with `format`, `origin` and `parserVersion`.
        await tx.card.update({
          where: { id: card.id },
          data: { parsedEffects: parsed as unknown as object },
        });
      });

      written++;
    }

    const metrics = summarize(parses);

    console.log('');
    console.log(`  written            ${written}`);
    console.log(`  up to date         ${skippedUpToDate}`);
    console.log(`  protected origin   ${skippedProtected}`);
    console.log(`  invalid (skipped)  ${skippedInvalid}`);
    console.log('');
    console.log(`  parsed this run    ${metrics.total}`);
    console.log(`  clean              ${metrics.parsedWithoutErrors}`);
    console.log(`  with warnings      ${metrics.parsedWithWarnings}`);
    console.log(`  failed             ${metrics.failed}`);
    console.log(`  avg confidence     ${metrics.averageConfidence}`);
    console.log(
      `  resolved actions   ${metrics.resolvedActionRate}` +
        ` (${metrics.actionsResolved}/${metrics.actionsTotal})`,
    );
    console.log('');
    console.log('  diagnostics by code:');
    for (const [code, count] of Object.entries(metrics.diagnosticCounts).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`    ${count.toString().padStart(6)}  ${code}`);
    }

    if (options.dryRun) console.log('\n  (dry run — nothing was written)');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
