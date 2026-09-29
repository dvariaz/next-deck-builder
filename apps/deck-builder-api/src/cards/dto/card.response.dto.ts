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
  @ApiProperty() id: number;
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
  @ApiPropertyOptional({ enum: MonsterEffectType })
  monsterEffectType?: MonsterEffectType;
  @ApiPropertyOptional({ enum: SpellTrapSubType })
  spellTrapSubType?: SpellTrapSubType;
  @ApiProperty() isEffect: boolean;
  @ApiProperty() isFlip: boolean;
  @ApiProperty() isTuner: boolean;
  @ApiProperty() isPendulum: boolean;
  @ApiProperty() isToon: boolean;
  @ApiProperty() isSpirit: boolean;
  @ApiProperty() isUnion: boolean;
  @ApiProperty() isGemini: boolean;
  @ApiProperty({ type: [String] }) linkMarkers: string[];
  @ApiProperty() isToken: boolean;
  @ApiProperty({ type: [String] }) aiTags: string[];

  // Extended metadata (YGOProDeck misc=yes)
  @ApiPropertyOptional() betaName?: string;
  @ApiPropertyOptional() treatedAs?: string;
  @ApiProperty({ type: [String] }) formats: string[];
  @ApiPropertyOptional() upvotes?: number;
  @ApiPropertyOptional() downvotes?: number;
  @ApiPropertyOptional() konamiId?: number;
  @ApiPropertyOptional() mdRarity?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) tcgDate?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) ocgDate?: string;

  @ApiProperty({ type: () => [CardImageResponseDto] })
  cardImages: CardImageResponseDto[];
}
