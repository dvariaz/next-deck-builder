import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindCardsDto } from './dto/find-cards.dto';

@Injectable()
export class CardsService {
  constructor(private prisma: PrismaService) {}

  async findAll(dto: FindCardsDto) {
    const where = this.buildWhere(dto);
    const [results, total] = await Promise.all([
      this.prisma.card.findMany({
        where,
        include: { cardImages: true },
        skip: dto.skip,
        take: dto.take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.card.count({ where }),
    ]);
    return { results, pagination: { total, skip: dto.skip ?? 0, take: dto.take ?? 20 } };
  }

  private buildWhere(dto: FindCardsDto): Prisma.CardWhereInput {
    const where: Prisma.CardWhereInput = {};
    const insensitive = Prisma.QueryMode.insensitive;

    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: insensitive } },
        { description: { contains: dto.q, mode: insensitive } },
      ];
    }

    if (dto.name) {
      where.name = { contains: dto.name, mode: insensitive };
    }

    if (dto.archetype) {
      where.archetype = { contains: dto.archetype, mode: insensitive };
    }

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

    if (dto.atkMin !== undefined || dto.atkMax !== undefined) {
      where.atk = {
        ...(dto.atkMin !== undefined && { gte: dto.atkMin }),
        ...(dto.atkMax !== undefined && { lte: dto.atkMax }),
      };
    }

    if (dto.defMin !== undefined || dto.defMax !== undefined) {
      where.def = {
        ...(dto.defMin !== undefined && { gte: dto.defMin }),
        ...(dto.defMax !== undefined && { lte: dto.defMax }),
      };
    }

    if (dto.levelMin !== undefined || dto.levelMax !== undefined) {
      where.level = {
        ...(dto.levelMin !== undefined && { gte: dto.levelMin }),
        ...(dto.levelMax !== undefined && { lte: dto.levelMax }),
      };
    }

    if (dto.isEffect !== undefined) where.isEffect = dto.isEffect;
    if (dto.isFlip !== undefined) where.isFlip = dto.isFlip;
    if (dto.isTuner !== undefined) where.isTuner = dto.isTuner;
    if (dto.isPendulum !== undefined) where.isPendulum = dto.isPendulum;
    if (dto.isToken !== undefined) where.isToken = dto.isToken;

    return where;
  }
}
