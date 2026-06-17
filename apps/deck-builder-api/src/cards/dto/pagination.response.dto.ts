import { ApiProperty } from '@nestjs/swagger';

export class PaginationResponseDto {
  @ApiProperty() total: number;
  @ApiProperty() skip: number;
  @ApiProperty() take: number;
}
