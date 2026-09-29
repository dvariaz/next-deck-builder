import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CardSort, FindCardsDto } from './dto/find-cards.dto';
import {
  insensitiveContains,
  levelOrLinkRange,
  linkMarkerFilter,
  numericRange,
} from './card-where.builder';

@Injectable()
export class CardsService {
  constructor(private prisma: PrismaService) {}

  async findAll(dto: FindCardsDto) {
    const where = this.buildWhere(dto);
    const orderBy: Prisma.CardOrderByWithRelationInput[] =
      dto.sort === CardSort.NEWEST
        ? // Newest by real TCG release date; cards never released in the TCG
          // (null tcgDate) sort last, then break ties by insertion order.
          [{ tcgDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
        : [{ name: 'asc' }];
    const [results, total] = await Promise.all([
      this.prisma.card.findMany({
        where,
        include: { cardImages: true },
        skip: dto.skip,
        take: dto.take,
        orderBy,
      }),
      this.prisma.card.count({ where }),
    ]);
    return {
      results,
      pagination: { total, skip: dto.skip ?? 0, take: dto.take ?? 20 },
    };
  }

  private buildWhere(dto: FindCardsDto): Prisma.CardWhereInput {
    const where: Prisma.CardWhereInput = {};
    const andConditions: Prisma.CardWhereInput[] = [];

    if (dto.q) {
      // Match cards containing every token somewhere in name/description,
      // regardless of order, so "Primite Ether" finds "Primite Dragon Ether Beryl".
      const tokens = dto.q.trim().split(/\s+/).filter(Boolean);
      andConditions.push(
        ...tokens.map((token) => ({
          OR: [
            { name: insensitiveContains(token) },
            { description: insensitiveContains(token) },
          ],
        })),
      );
    }

    const name = insensitiveContains(dto.name);
    if (name) where.name = name;

    const archetype = insensitiveContains(dto.archetype);
    if (archetype) where.archetype = archetype;

    if (dto.attribute?.length) where.attribute = { in: dto.attribute };
    if (dto.race?.length) where.race = { in: dto.race };
    if (dto.cardType?.length) where.cardType = { in: dto.cardType };
    if (dto.frameType?.length) where.frameType = { in: dto.frameType };
    if (dto.summonType?.length) where.summonType = { in: dto.summonType };
    if (dto.monsterEffectType?.length)
      where.monsterEffectType = { in: dto.monsterEffectType };
    if (dto.spellTrapSubType?.length)
      where.spellTrapSubType = { in: dto.spellTrapSubType };
    if (dto.banStatusTcg?.length) where.banStatusTcg = { in: dto.banStatusTcg };
    if (dto.banStatusOcg?.length) where.banStatusOcg = { in: dto.banStatusOcg };

    Object.assign(
      where,
      linkMarkerFilter(dto.linkMarker, dto.linkMarkerStrict),
    );

    const atk = numericRange(dto.atkMin, dto.atkMax);
    if (atk) where.atk = atk;

    const def = numericRange(dto.defMin, dto.defMax);
    if (def) where.def = def;

    const level = levelOrLinkRange(dto.levelMin, dto.levelMax);
    if (level) andConditions.push(level);

    if (andConditions.length) where.AND = andConditions;

    if (dto.isEffect !== undefined) where.isEffect = dto.isEffect;
    if (dto.isFlip !== undefined) where.isFlip = dto.isFlip;
    if (dto.isTuner !== undefined) where.isTuner = dto.isTuner;
    if (dto.isPendulum !== undefined) where.isPendulum = dto.isPendulum;
    if (dto.isToon !== undefined) where.isToon = dto.isToon;
    if (dto.isSpirit !== undefined) where.isSpirit = dto.isSpirit;
    if (dto.isUnion !== undefined) where.isUnion = dto.isUnion;
    if (dto.isGemini !== undefined) where.isGemini = dto.isGemini;
    if (dto.isToken !== undefined) where.isToken = dto.isToken;

    return where;
  }
}
