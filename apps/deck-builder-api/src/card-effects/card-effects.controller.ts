import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CardEffectsService } from './card-effects.service';

@ApiTags('card-effects')
@Controller('cards/:id')
export class CardEffectsController {
  constructor(private readonly cardEffects: CardEffectsService) {}

  @Get('effects')
  @ApiOperation({
    summary: "A card's parsed effect IR, with spans and diagnostics",
  })
  effects(@Param('id', ParseIntPipe) id: number) {
    return this.cardEffects.parseFor(id);
  }

  @Get('fetches')
  @ApiOperation({
    summary: 'Cards this card can fetch, per resolved search action',
  })
  fetches(@Param('id', ParseIntPipe) id: number) {
    return this.cardEffects.fetches(id);
  }
}
