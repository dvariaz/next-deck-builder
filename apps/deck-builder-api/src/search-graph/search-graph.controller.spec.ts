import { Test } from '@nestjs/testing';
import { CardEffectsService } from './card-effects.service';
import { SearchGraphController } from './search-graph.controller';
import { SearchGraphService } from './search-graph.service';
import type { SearchGraphQueryDto } from './dto/search-graph-query.dto';

const graph = {
  buildForCard: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
  expandCard: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
};
const effects = { forCard: jest.fn().mockResolvedValue({ effects: [] }) };

describe('SearchGraphController', () => {
  let controller: SearchGraphController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SearchGraphController],
      providers: [
        { provide: SearchGraphService, useValue: graph },
        { provide: CardEffectsService, useValue: effects },
      ],
    }).compile();
    controller = module.get(SearchGraphController);
    jest.clearAllMocks();
  });

  describe('GET :id/search-graph', () => {
    it('passes the card id through', async () => {
      await controller.build(42, {} as SearchGraphQueryDto);
      expect(graph.buildForCard).toHaveBeenCalledWith(42, {});
    });

    it('forwards only the options the caller actually set', async () => {
      // Unset options must not be forwarded as undefined, or they would
      // override the service defaults.
      await controller.build(42, { depth: 3 } as SearchGraphQueryDto);
      expect(graph.buildForCard).toHaveBeenCalledWith(42, { depth: 3 });
    });

    it('forwards every supported option', async () => {
      await controller.build(1, {
        depth: 1,
        archetypeOnly: true,
        includeSelfLoops: true,
        kinds: ['DECK_SEARCH'],
      } as SearchGraphQueryDto);

      expect(graph.buildForCard).toHaveBeenCalledWith(1, {
        depth: 1,
        archetypeOnly: true,
        includeSelfLoops: true,
        kinds: ['DECK_SEARCH'],
      });
    });

    it('forwards explicit false, which is meaningfully different from unset', async () => {
      await controller.build(1, {
        archetypeOnly: false,
      } as SearchGraphQueryDto);
      expect(graph.buildForCard.mock.calls[0][1]).toEqual({
        archetypeOnly: false,
      });
    });
  });

  describe('POST search-graph/expand', () => {
    it('expands a card node', async () => {
      await controller.expand({
        cardId: 7,
        known: ['card:1'],
      } as never);
      expect(graph.expandCard).toHaveBeenCalledWith(7, { known: ['card:1'] });
    });
  });

  describe('GET :id/effects', () => {
    it('returns the parsed IR for the card', async () => {
      await controller.cardEffects(5);
      expect(effects.forCard).toHaveBeenCalledWith(5);
    });
  });
});
