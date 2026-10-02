import 'dotenv/config';
import { PrismaClient, Prisma } from '../../generated/prisma/client';
import { createPrismaAdapter } from '../prisma-adapter.factory';
import { parseCardEffects } from '../../src/card-effect-parser/card-effect-parser';
import {
  PARSER_VERSION,
  type ParsedCardEffects,
  type ParserContext,
} from '../../src/card-effect-parser/card-effect.types';

/**
 * Parse every card's effect text into the structured IR and persist it to
 * Card.cardEffects.
 *
 * Flags:
 *   --dry           parse and report, write nothing
 *   --force         re-parse rows already parsed, including non-RULES origins
 *   --only=<name>   a single card, for debugging a parse
 *   --limit=<n>     stop after n cards (with --dry, for a quick sample)
 */

const BATCH_SIZE = 500;

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const value = (prefix: string) =>
  args.find((a) => a.startsWith(prefix))?.slice(prefix.length);

const DRY = has('--dry');
const FORCE = has('--force');
const ONLY = value('--only=');
const LIMIT = Number(value('--limit=') ?? '0') || undefined;

async function loadVocabulary(prisma: PrismaClient) {
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

  return {
    archetypes: new Set(
      archetypeRows.map((r) => r.archetype).filter((a): a is string => !!a),
    ),
    // One row carries an empty race; it would match everywhere.
    races: new Set(
      raceRows
        .map((r) => r.race)
        .filter((r): r is string => !!r && r.length > 0),
    ),
  };
}

/**
 * The rules pass must never clobber output from a future LLM or manual pass.
 * That is the whole point of the `origin` discriminator.
 */
function shouldSkip(existing: unknown): boolean {
  if (FORCE) return false;
  const parsed = existing as ParsedCardEffects | null;
  if (!parsed) return false;
  if (parsed.origin && parsed.origin !== 'RULES') return true;
  return parsed.version === PARSER_VERSION;
}

async function main() {
  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

  try {
    const { archetypes, races } = await loadVocabulary(prisma);
    console.log(
      `vocabulary: ${archetypes.size} archetypes, ${races.size} monster races`,
    );

    const where: Prisma.CardWhereInput = ONLY ? { name: ONLY } : {};

    const total = await prisma.card.count({ where });
    console.log(`${total} cards to consider${DRY ? ' (dry run)' : ''}\n`);

    const verbHistogram = new Map<string, number>();
    const zoneHistogram = new Map<string, number>();
    let parsedCount = 0;
    let skipped = 0;
    let withEffects = 0;
    let needsReview = 0;
    let resolvedSearches = 0;
    let deckToHandSearches = 0;
    const samples: string[] = [];

    for (let skip = 0; skip < total; skip += BATCH_SIZE) {
      const batch = await prisma.card.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          cardEffects: true,
          // The parser classifies effects differently by card type: the
          // colon/semicolon chain clue is a MONSTER-effect rule.
          cardType: true,
          spellTrapSubType: true,
        },
        take: LIMIT ? Math.min(BATCH_SIZE, LIMIT - parsedCount) : BATCH_SIZE,
        skip,
        orderBy: { id: 'asc' },
      });
      if (!batch.length) break;

      const updates: { id: number; parsed: ParsedCardEffects }[] = [];

      for (const card of batch) {
        if (shouldSkip(card.cardEffects)) {
          skipped++;
          continue;
        }

        const ctx: ParserContext = {
          archetypes,
          races,
          cardName: card.name,
          cardType: card.cardType,
          ...(card.spellTrapSubType
            ? { spellTrapSubType: card.spellTrapSubType }
            : {}),
        };
        const parsed = parseCardEffects(card.description, ctx);
        parsedCount++;

        if (parsed.effects.length) withEffects++;
        if (parsed.needsReview) needsReview++;

        for (const effect of parsed.effects) {
          for (const action of effect.actions) {
            verbHistogram.set(
              action.verb,
              (verbHistogram.get(action.verb) ?? 0) + 1,
            );

            const isSearch = [
              'ADD',
              'SPECIAL_SUMMON',
              'NORMAL_SUMMON',
              'SET',
            ].includes(action.verb);
            if (action.resolved && isSearch) {
              resolvedSearches++;
              for (const zone of action.sourceZones) {
                const key = `${action.verb} from ${zone.zone}`;
                zoneHistogram.set(key, (zoneHistogram.get(key) ?? 0) + 1);
              }
              if (
                action.verb === 'ADD' &&
                action.sourceZones.some((z) => z.zone === 'DECK')
              ) {
                deckToHandSearches++;
                if (samples.length < 8) {
                  samples.push(
                    `${card.name}  ->  ${
                      action.target.kind === 'criteria'
                        ? action.target.label
                        : action.target.kind === 'named'
                          ? action.target.names.join(' / ')
                          : action.target.kind
                    }`,
                  );
                }
              }
            }
          }
        }

        updates.push({ id: card.id, parsed });
      }

      if (!DRY && updates.length) {
        await prisma.$transaction(
          updates.map(({ id, parsed }) =>
            prisma.card.update({
              where: { id },
              data: {
                cardEffects: parsed as unknown as Prisma.InputJsonValue,
                effectsParsedAt: new Date(),
              },
            }),
          ),
        );
      }

      if (LIMIT && parsedCount >= LIMIT) break;
      if (!ONLY && skip % (BATCH_SIZE * 4) === 0 && skip > 0) {
        console.log(`  ...${skip}/${total}`);
      }
    }

    const pct = (n: number) => `${((n / parsedCount) * 100).toFixed(1)}%`;

    console.log(`\nparsed          ${parsedCount}`);
    console.log(`skipped         ${skipped}`);
    console.log(`with effects    ${withEffects} (${pct(withEffects)})`);
    console.log(`needs review    ${needsReview} (${pct(needsReview)})`);
    console.log(`resolved search actions  ${resolvedSearches}`);
    console.log(`  of which Deck -> hand  ${deckToHandSearches}`);

    console.log('\nverbs:');
    for (const [verb, count] of [...verbHistogram].sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${verb.padEnd(16)} ${count}`);
    }

    console.log('\nsearch kinds:');
    for (const [key, count] of [...zoneHistogram].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${key.padEnd(34)} ${count}`);
    }

    if (samples.length) {
      console.log('\nsample deck searches:');
      for (const sample of samples) console.log(`  ${sample}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
