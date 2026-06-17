import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  BanStatus,
  CardFrameType,
  CardType,
  MonsterEffectType,
  SpellTrapSubType,
  SummonType,
} from '../../../generated/prisma/enums';
import { toBoolean } from '../../common/transforms';

export class FindCardsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archetype?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attribute?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  race?: string;

  @ApiPropertyOptional({ enum: CardType })
  @IsOptional()
  @IsEnum(CardType)
  cardType?: CardType;

  @ApiPropertyOptional({ enum: CardFrameType })
  @IsOptional()
  @IsEnum(CardFrameType)
  frameType?: CardFrameType;

  @ApiPropertyOptional({ enum: SummonType })
  @IsOptional()
  @IsEnum(SummonType)
  summonType?: SummonType;

  @ApiPropertyOptional({ enum: MonsterEffectType })
  @IsOptional()
  @IsEnum(MonsterEffectType)
  monsterEffectType?: MonsterEffectType;

  @ApiPropertyOptional({ enum: SpellTrapSubType })
  @IsOptional()
  @IsEnum(SpellTrapSubType)
  spellTrapSubType?: SpellTrapSubType;

  @ApiPropertyOptional({ enum: BanStatus })
  @IsOptional()
  @IsEnum(BanStatus)
  banStatusTcg?: BanStatus;

  @ApiPropertyOptional({ enum: BanStatus })
  @IsOptional()
  @IsEnum(BanStatus)
  banStatusOcg?: BanStatus;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  atkMin?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  atkMax?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defMin?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defMax?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  levelMin?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  levelMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isEffect?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFlip?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isTuner?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPendulum?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isToken?: boolean;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}
