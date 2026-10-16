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

  /**
   * Structured effect IR (a `ParsedCard`).
   *
   * A stored column, written by a batch script at seed time and after a parser
   * upgrade — never computed on a request, and no join, so including it does
   * not change the cost of this query. ~1.6 KB per card.
   *
   * Parser-agnostic: the object carries its own metadata, so a second parser
   * needs no new field here.
   *
   *   format        "psct" | "legacy" — what the TEXT is. Select on this to
   *                 route cards to a different parser.
   *   origin        "rules" | "llm" | "manual" — which parser produced it.
   *   parserVersion which revision of that parser.
   *   parsedAt      when.
   *
   * Typed loosely here on purpose — the authoritative contract is
   * `psct-parser/ast.ts`, and duplicating that tree into Swagger DTOs would
   * create a second definition to keep in sync.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Parsed effect IR. Carries format/origin/parserVersion/parsedAt. See psct-parser/ast.ts.',
  })
  parsedEffects?: Record<string, unknown>;
}
