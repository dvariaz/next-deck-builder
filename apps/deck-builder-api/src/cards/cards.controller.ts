import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CardsService } from './cards.service';
import { CardsResponseDto } from './dto/cards-response.dto';
import { FindCardsDto } from './dto/find-cards.dto';

@ApiTags('cards')
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter cards' })
  @ApiOkResponse({ type: CardsResponseDto })
  findAll(@Query() query: FindCardsDto) {
    return this.cardsService.findAll(query);
  }
}
