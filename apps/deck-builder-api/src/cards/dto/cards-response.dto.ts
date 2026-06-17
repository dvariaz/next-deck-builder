import { ApiProperty } from '@nestjs/swagger';
import { CardResponseDto } from './card.response.dto';
import { PaginationResponseDto } from './pagination.response.dto';

export class CardsResponseDto {
  @ApiProperty({ type: () => [CardResponseDto] }) results: CardResponseDto[];
  @ApiProperty({ type: () => PaginationResponseDto }) pagination: PaginationResponseDto;
}
