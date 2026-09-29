import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SearchGraphQueryDto } from './search-graph-query.dto';

/**
 * Grow an existing graph without refetching it.
 *
 * `known` is what makes this work: the server omits nodes the client already
 * holds, but still returns every edge into them, so the client can merge a
 * delta and still close cycles back into rendered nodes.
 */
export class SearchGraphExpandDto extends SearchGraphQueryDto {
  @ApiProperty({ description: 'The card node to expand one more tier.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cardId: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Node ids the client already has. Omitted from nodes, but edges into them are still returned.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  known?: string[];

  @ApiPropertyOptional({ minimum: 1, maximum: 3, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  declare depth?: number;
}
