import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BanStatus,
  CardFrameType,
  CardType,
  MonsterEffectType,
  SpellTrapSubType,
  SummonType,
} from '../../../generated/prisma/enums';
import { CardImageResponseDto } from './card-image.response.dto';

export class CardResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() ygoId: number;
  @ApiProperty() name: string;
  @ApiProperty({ enum: CardType }) cardType: CardType;
  @ApiProperty({ enum: CardFrameType }) frameType: CardFrameType;
  @ApiProperty() description: string;
  @ApiPropertyOptional() archetype?: string;
  @ApiProperty() ygoprodeckUrl: string;
  @ApiPropertyOptional({ enum: BanStatus }) banStatusTcg?: BanStatus;
  @ApiPropertyOptional({ enum: BanStatus }) banStatusOcg?: BanStatus;
  @ApiPropertyOptional() atk?: number;
  @ApiPropertyOptional() def?: number;
  @ApiPropertyOptional() level?: number;
  @ApiPropertyOptional() linkVal?: number;
  @ApiPropertyOptional() scale?: number;
  @ApiPropertyOptional() attribute?: string;
  @ApiPropertyOptional() race?: string;
  @ApiPropertyOptional({ enum: SummonType }) summonType?: SummonType;
  @ApiPropertyOptional({ enum: MonsterEffectType }) monsterEffectType?: MonsterEffectType;
  @ApiPropertyOptional({ enum: SpellTrapSubType }) spellTrapSubType?: SpellTrapSubType;
  @ApiProperty() isEffect: boolean;
  @ApiProperty() isFlip: boolean;
  @ApiProperty() isTuner: boolean;
  @ApiProperty() isPendulum: boolean;
  @ApiProperty({ type: [String] }) linkMarkers: string[];
  @ApiProperty() isToken: boolean;
  @ApiProperty({ type: [String] }) aiTags: string[];
  @ApiProperty({ type: () => [CardImageResponseDto] }) cardImages: CardImageResponseDto[];
}
