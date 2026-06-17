import { ApiProperty } from '@nestjs/swagger';

export class CardImageResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() imageUrl: string;
  @ApiProperty() imageUrlSmall: string;
  @ApiProperty() imageUrlCropped: string;
}
