import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { toArray, toBoolean } from '../../common/transforms';
import { SearchKind } from '../search-effect';

const SEARCH_KINDS = Object.values(SearchKind);

export class SearchGraphQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 3,
    default: 2,
    description: 'How many tiers to expand from the root card.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  depth?: number = 2;

  @ApiPropertyOptional({
    default: false,
    description:
      "Only expand targets sharing the root card's archetype. Constrains the expansion budget.",
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  archetypeOnly?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Draw edges from a card to itself. Common and usually noise.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeSelfLoops?: boolean;

  @ApiPropertyOptional({
    isArray: true,
    enum: SEARCH_KINDS,
    enumName: 'SearchKind',
    description: 'Keep only edges matching at least one of these kinds.',
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(SEARCH_KINDS, { each: true })
  kinds?: string[];
}
