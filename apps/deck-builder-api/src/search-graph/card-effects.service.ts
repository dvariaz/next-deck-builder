import { Injectable, NotFoundException } from '@nestjs/common';
import { parseCardAliases, type CardAlias } from '../card-effect-parser/alias';
import { parseCardEffects } from '../card-effect-parser/card-effect-parser';
import {
  PARSER_VERSION,
  type ParsedCardEffects,
} from '../card-effect-parser/card-effect.types';
import { PrismaService } from '../prisma/prisma.service';
import { EffectVocabularyService } from './effect-vocabulary.service';

/** Serves the parsed IR for a single card, for inspection and debugging. */
@Injectable()
export class CardEffectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vocabulary: EffectVocabularyService,
  ) {}

  async forCard(
    id: number,
  ): Promise<ParsedCardEffects & { cardName: string; aliases: CardAlias[] }> {
    const card = await this.prisma.card.findUnique({
      where: { id },
      select: { name: true, description: true, cardEffects: true },
    });
    if (!card) throw new NotFoundException(`Card ${id} not found`);

    const persisted = card.cardEffects as unknown as ParsedCardEffects | null;
    const parsed =
      persisted && persisted.version === PARSER_VERSION
        ? persisted
        : parseCardEffects(
            card.description,
            this.vocabulary.contextFor(card.name),
          );

    // Always parsed live: aliases are not persisted, and this endpoint is the
    // audit surface for them.
    return {
      ...parsed,
      cardName: card.name,
      aliases: parseCardAliases(card.description),
    };
  }
}
