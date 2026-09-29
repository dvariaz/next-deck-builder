import { ApiProperty } from '@nestjs/swagger';

/**
 * The parsed IR, returned loosely typed on purpose.
 *
 * The effect shape is versioned and evolving, and this endpoint exists for
 * inspection rather than for the UI to bind to - pinning every nested field
 * into Swagger would freeze the IR for no benefit.
 */
export class CardEffectsResponseDto {
  @ApiProperty() cardName: string;
  @ApiProperty() version: number;
  @ApiProperty() parsedAt: string;
  @ApiProperty({ enum: ['RULES', 'LLM', 'MANUAL'], enumName: 'EffectOrigin' })
  origin: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'CardEffect[] — see src/card-effect-parser/card-effect.types.ts',
  })
  effects: unknown[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'CardAlias[] — other names this card is treated as, and where. See src/card-effect-parser/alias.ts',
  })
  aliases: unknown[];

  @ApiProperty({ type: [String] }) unparsed: string[];
  @ApiProperty() needsReview: boolean;
}
