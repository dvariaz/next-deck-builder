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

    if (dto.name) {
      where.name = { contains: dto.name, mode: Prisma.QueryMode.insensitive };
    }

    if (dto.archetype) {
      where.archetype = { contains: dto.archetype, mode: Prisma.QueryMode.insensitive };
    }

    if (dto.attribute) where.attribute = dto.attribute;
    if (dto.race) where.race = dto.race;
    if (dto.cardType) where.cardType = dto.cardType;
    if (dto.frameType) where.frameType = dto.frameType;
    if (dto.summonType) where.summonType = dto.summonType;
    if (dto.monsterEffectType) where.monsterEffectType = dto.monsterEffectType;
    if (dto.spellTrapSubType) where.spellTrapSubType = dto.spellTrapSubType;
    if (dto.banStatusTcg) where.banStatusTcg = dto.banStatusTcg;
    if (dto.banStatusOcg) where.banStatusOcg = dto.banStatusOcg;

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
