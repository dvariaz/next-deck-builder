import { ApiProperty } from '@nestjs/swagger';

export class CardSetResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() setName: string;
  @ApiProperty() setCode: string;
  @ApiProperty() setRarity: string;
  @ApiProperty() setRarityCode: string;
}
