import { Controller, Get, Query } from '@nestjs/common';
import { CardsService } from './cards.service';
import { FindCardsDto } from './dto/find-cards.dto';

@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  findAll(@Query() query: FindCardsDto) {
    return this.cardsService.findAll(query);
  }
}
