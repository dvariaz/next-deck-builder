import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SearchKind } from '../search-effect';

const SEARCH_KINDS = Object.values(SearchKind);
const SEARCH_VERBS = ['ADD', 'SPECIAL_SUMMON', 'NORMAL_SUMMON', 'SET'];

export class ZoneRefDto {
  @ApiProperty({ example: 'DECK' }) zone: string;
  @ApiProperty({ enum: ['SELF', 'OPPONENT', 'EITHER'], enumName: 'ZoneOwner' })
  owner: string;
}

/** The card tile payload. One image, not the full alt-art list. */
export class SearchGraphCardDto {
  @ApiProperty() id: number;
  @ApiProperty() ygoId: number;
  @ApiProperty() name: string;
  @ApiProperty() cardType: string;
  @ApiProperty() frameType: string;
  @ApiPropertyOptional({ nullable: true }) archetype?: string | null;
  @ApiPropertyOptional({ nullable: true }) banStatusTcg?: string | null;
  @ApiPropertyOptional({ nullable: true }) banStatusOcg?: string | null;
  @ApiPropertyOptional({ nullable: true }) imageUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) imageUrlSmall?: string | null;
  @ApiPropertyOptional({ nullable: true }) imageUrlCropped?: string | null;
}

export class SearchGraphNodeDto {
  @ApiProperty({ example: 'card:123' }) id: string;
  @ApiProperty() depth: number;
  @ApiProperty() isRoot: boolean;

  @ApiProperty({
    description:
      'Has both an inbound and an outbound edge. This is the chained/domino search category, which is a property of the graph rather than of any one card.',
  })
  isChainLink: boolean;

  @ApiProperty({ type: () => SearchGraphCardDto })
  card: SearchGraphCardDto;
}

export class SearchGraphEdgeDto {
  @ApiProperty() id: string;
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiProperty({ enum: SEARCH_VERBS, enumName: 'SearchVerb' }) verb: string;

  @ApiProperty({
    isArray: true,
    enum: SEARCH_KINDS,
    enumName: 'SearchKind',
    description: 'Drives the edge label and colour.',
  })
  kinds: string[];

  @ApiProperty({ type: () => [ZoneRefDto] }) sourceZones: ZoneRefDto[];
  @ApiPropertyOptional() destination?: string;
  @ApiProperty() optional: boolean;

  @ApiProperty({ type: [String], example: ['Discard 1'] }) costs: string[];
  @ApiProperty({ type: [String], example: ['Hard once per turn'] })
  restrictions: string[];

  @ApiPropertyOptional({
    example: 'Fallen of Albaz',
    description:
      'The other name the target answers to, when that is what made it a match.',
  })
  matchedAlias?: string;

  @ApiProperty({ description: 'The exact sentence this edge came from.' })
  sourceText: string;
}

export class SearchGraphTruncationDto {
  @ApiProperty() byDepth: boolean;
  @ApiProperty() depth: number;
}

export class SearchGraphResponseDto {
  @ApiProperty() rootId: string;
  @ApiProperty({ type: () => [SearchGraphNodeDto] })
  nodes: SearchGraphNodeDto[];
  @ApiProperty({ type: () => [SearchGraphEdgeDto] })
  edges: SearchGraphEdgeDto[];
  @ApiProperty({ type: () => SearchGraphTruncationDto })
  truncated: SearchGraphTruncationDto;
  @ApiProperty() parserVersion: number;
}
