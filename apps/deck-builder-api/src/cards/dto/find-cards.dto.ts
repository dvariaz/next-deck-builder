import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BanStatus,
  CardFrameType,
  CardType,
  MonsterEffectType,
  SpellTrapSubType,
  SummonType,
} from '../../../generated/prisma/enums';

export class FindCardsDto {
  // Text search
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  archetype?: string;

  @IsOptional()
  @IsString()
  attribute?: string;

  @IsOptional()
  @IsString()
  race?: string;

  // Enum filters
  @IsOptional()
  @IsEnum(CardType)
  cardType?: CardType;

  @IsOptional()
  @IsEnum(CardFrameType)
  frameType?: CardFrameType;

  @IsOptional()
  @IsEnum(SummonType)
  summonType?: SummonType;

  @IsOptional()
  @IsEnum(MonsterEffectType)
  monsterEffectType?: MonsterEffectType;

  @IsOptional()
  @IsEnum(SpellTrapSubType)
  spellTrapSubType?: SpellTrapSubType;

  @IsOptional()
  @IsEnum(BanStatus)
  banStatusTcg?: BanStatus;

  @IsOptional()
  @IsEnum(BanStatus)
  banStatusOcg?: BanStatus;

  // Numeric range filters
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  atkMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  atkMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  levelMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  levelMax?: number;

  // Boolean flags
  @IsOptional()
  @IsBoolean()
  isEffect?: boolean;

  @IsOptional()
  @IsBoolean()
  isFlip?: boolean;

  @IsOptional()
  @IsBoolean()
  isTuner?: boolean;

  @IsOptional()
  @IsBoolean()
  isPendulum?: boolean;

  @IsOptional()
  @IsBoolean()
  isToken?: boolean;

  // Pagination
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}
