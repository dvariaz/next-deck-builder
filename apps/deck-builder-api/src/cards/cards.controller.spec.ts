import { Test, TestingModule } from '@nestjs/testing';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { FindCardsDto } from './dto/find-cards.dto';

const mockCardsService = {
  findAll: jest.fn(),
};

describe('CardsController', () => {
  let controller: CardsController;
  let service: typeof mockCardsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CardsController],
      providers: [{ provide: CardsService, useValue: mockCardsService }],
    }).compile();

    controller = module.get<CardsController>(CardsController);
    service = module.get(CardsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('delegates the query DTO to the service', () => {
      const dto: FindCardsDto = { skip: 0, take: 20 };
      const expected = [{ id: 1, name: 'Dark Magician' }];
      service.findAll.mockReturnValue(expected);

      const result = controller.findAll(dto);

      expect(service.findAll).toHaveBeenCalledWith(dto);
      expect(result).toBe(expected);
    });

    it('passes text filters through', () => {
      const dto: FindCardsDto = { name: 'dragon', archetype: 'Blue-Eyes', skip: 0, take: 20 };
      controller.findAll(dto);
      expect(service.findAll).toHaveBeenCalledWith(dto);
    });

    it('passes enum filters through', () => {
      const dto: FindCardsDto = { cardType: ['MONSTER'], summonType: ['FUSION'], skip: 0, take: 20 };
      controller.findAll(dto);
      expect(service.findAll).toHaveBeenCalledWith(dto);
    });

    it('passes range filters through', () => {
      const dto: FindCardsDto = { atkMin: 2000, atkMax: 3000, skip: 0, take: 20 };
      controller.findAll(dto);
      expect(service.findAll).toHaveBeenCalledWith(dto);
    });

    it('passes boolean flag filters through', () => {
      const dto: FindCardsDto = { isTuner: true, isPendulum: false, skip: 0, take: 20 };
      controller.findAll(dto);
      expect(service.findAll).toHaveBeenCalledWith(dto);
    });

    it('passes custom pagination through', () => {
      const dto: FindCardsDto = { skip: 40, take: 10 };
      controller.findAll(dto);
      expect(service.findAll).toHaveBeenCalledWith(dto);
    });
  });
});
