import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ParserContext } from '../card-effect-parser/card-effect.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Supplies the parser with the archetype and monster-Type vocabularies it
 * cannot know statically.
 *
 * Loaded once at boot: ~650 archetypes and ~27 races, so this is a trivial
 * amount of memory and one query, but it turns every live parse into a pure
 * in-memory operation.
 */
@Injectable()
export class EffectVocabularyService implements OnModuleInit {
  private archetypes: ReadonlySet<string> = new Set();
  private races: ReadonlySet<string> = new Set();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh();
  }

  async refresh() {
    const [archetypeRows, raceRows] = await Promise.all([
      this.prisma.card.findMany({
        where: { archetype: { not: null } },
        select: { archetype: true },
        distinct: ['archetype'],
      }),
      this.prisma.card.findMany({
        // Card.race doubles as the Spell/Trap subtype column, so only monster
        // rows carry real monster Types.
        where: { cardType: 'MONSTER', race: { not: null } },
        select: { race: true },
        distinct: ['race'],
      }),
    ]);

    this.archetypes = new Set(
      archetypeRows
        .map((row) => row.archetype)
        .filter((value): value is string => !!value),
    );

    // One row carries an empty race; left in, it would match every phrase.
    this.races = new Set(
      raceRows
        .map((row) => row.race)
        .filter((value): value is string => !!value && value.length > 0),
    );
  }

  contextFor(cardName: string): ParserContext {
    return { archetypes: this.archetypes, races: this.races, cardName };
  }
}
