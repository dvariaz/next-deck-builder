import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchGraphExpandDto } from './dto/search-graph-expand.dto';
import { SearchGraphQueryDto } from './dto/search-graph-query.dto';
import { SearchGraphResponseDto } from './dto/search-graph.response.dto';
import { CardEffectsResponseDto } from './dto/card-effects.response.dto';
import { SearchGraphService } from './search-graph.service';
import { CardEffectsService } from './card-effects.service';
import type { SearchGraphOptions } from './search-graph.types';
import type { SearchKind } from './search-effect';

/**
 * Mounted under /cards so the graph reads as part of the card resource.
 *
 * Registration order matters: a future `GET /cards/:id` must be registered
 * AFTER this module or it will swallow these routes.
 */
@ApiTags('cards')
@Controller('cards')
export class SearchGraphController {
  constructor(
    private readonly graph: SearchGraphService,
    private readonly effects: CardEffectsService,
  ) {}

  @Get(':id/search-graph')
  @ApiOperation({
    summary: 'Build the search graph rooted at a card',
    description:
      'Returns what this card can add to hand, Special/Normal Summon or Set, and what those cards reach in turn.',
  })
  @ApiOkResponse({ type: SearchGraphResponseDto })
  build(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SearchGraphQueryDto,
  ) {
    return this.graph.buildForCard(id, toOptions(query));
  }

  @Post('search-graph/expand')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Grow an existing graph (read-only)',
    description:
      '`known` is routinely 60+ ids, which does not survive a querystring, hence POST. Nothing is written.',
  })
  @ApiOkResponse({ type: SearchGraphResponseDto })
  expand(@Body() body: SearchGraphExpandDto) {
    const options = { ...toOptions(body), known: body.known };
    return this.graph.expandCard(body.cardId, options);
  }

  @Get(':id/effects')
  @ApiOperation({
    summary: 'The parsed effect IR for a card',
    description:
      'Parser inspection against real data. Shows every action, not just the ones the graph draws edges from.',
  })
  @ApiOkResponse({ type: CardEffectsResponseDto })
  cardEffects(@Param('id', ParseIntPipe) id: number) {
    return this.effects.forCard(id);
  }
}

/** Only pass through what the caller actually set, so defaults stay in one place. */
function toOptions(query: SearchGraphQueryDto): Partial<SearchGraphOptions> {
  const options: Partial<SearchGraphOptions> = {};

  if (query.depth !== undefined) options.depth = query.depth;
  if (query.archetypeOnly !== undefined) {
    options.archetypeOnly = query.archetypeOnly;
  }
  if (query.includeSelfLoops !== undefined) {
    options.includeSelfLoops = query.includeSelfLoops;
  }
  if (query.kinds?.length) options.kinds = query.kinds as SearchKind[];

  return options;
}
