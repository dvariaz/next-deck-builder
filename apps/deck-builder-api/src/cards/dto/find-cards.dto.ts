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
import { toArray, toBoolean } from '../../common/transforms';

export class FindCardsDto {
  @ApiPropertyOptional({
    description: 'Full-text search across card name and description',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archetype?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsString({ each: true })
  attribute?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsString({ each: true })
  race?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsString({ each: true })
  linkMarker?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  linkMarkerStrict?: boolean;

  @ApiPropertyOptional({ enum: CardType, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(CardType, { each: true })
  cardType?: CardType[];

  @ApiPropertyOptional({ enum: CardFrameType, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(CardFrameType, { each: true })
  frameType?: CardFrameType[];

  @ApiPropertyOptional({ enum: SummonType, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(SummonType, { each: true })
  summonType?: SummonType[];

  @ApiPropertyOptional({ enum: MonsterEffectType, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(MonsterEffectType, { each: true })
  monsterEffectType?: MonsterEffectType[];

  @ApiPropertyOptional({ enum: SpellTrapSubType, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(SpellTrapSubType, { each: true })
  spellTrapSubType?: SpellTrapSubType[];

  @ApiPropertyOptional({ enum: BanStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(BanStatus, { each: true })
  banStatusTcg?: BanStatus[];

  @ApiPropertyOptional({ enum: BanStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(BanStatus, { each: true })
  banStatusOcg?: BanStatus[];

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
  isToon?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isSpirit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isUnion?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isGemini?: boolean;

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
