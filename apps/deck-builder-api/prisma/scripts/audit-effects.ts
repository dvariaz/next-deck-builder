import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/client';
import { createPrismaAdapter } from '../prisma-adapter.factory';
import { parseCardEffects } from '../../src/card-effect-parser/card-effect-parser';
import type { ParserContext } from '../../src/card-effect-parser/card-effect.types';

/** Flags resolved search actions whose source text smells like a false positive. */
const SUSPICIOUS: { label: string; re: RegExp }[] = [
  { label: 'negation', re: /\b(?:cannot|can't|unable to)\b/i },
  { label: 'passive', re: /\bis (?:Special |Normal )?Summoned\b/i },
  { label: 'opponent-does', re: /\byour opponent (?:can|must)\b/i },
  { label: 'negate-context', re: /\bnegate\b/i },
  { label: 'conditional', re: /^(?:If|When|While)\b/i },
];

async function main() {
  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });
  try {
    const [aRows, rRows] = await Promise.all([
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
    const archetypes = new Set(aRows.map((r) => r.archetype!).filter(Boolean));
    const races = new Set(
      rRows.map((r) => r.race!).filter((r) => r && r.length),
    );

    const cards = await prisma.card.findMany({
      select: {
        name: true,
        description: true,
        cardType: true,
        spellTrapSubType: true,
      },
    });

    const hits = new Map<string, { name: string; text: string }[]>();
    let totalSearches = 0;

    for (const card of cards) {
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
      for (const effect of parsed.effects) {
        for (const action of effect.actions) {
          const isSearch = [
            'ADD',
            'SPECIAL_SUMMON',
            'NORMAL_SUMMON',
            'SET',
          ].includes(action.verb);
          if (!action.resolved || !isSearch) continue;
          totalSearches++;
          for (const { label, re } of SUSPICIOUS) {
            if (!re.test(action.sourceText)) continue;
            if (!hits.has(label)) hits.set(label, []);
            hits.get(label)!.push({ name: card.name, text: action.sourceText });
          }
        }
      }
    }

    console.log(`resolved search actions: ${totalSearches}\n`);
    for (const [label, rows] of [...hits].sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      const pct = ((rows.length / totalSearches) * 100).toFixed(2);
      console.log(`${label}: ${rows.length} (${pct}%)`);
      for (const row of rows.slice(0, 4)) {
        console.log(`   ${row.name}\n     "${row.text.slice(0, 130)}"`);
      }
      console.log();
    }
  } finally {
    await prisma.$disconnect();
  }
}
void main();
