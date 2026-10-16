import { Module } from '@nestjs/common';
import { CardEffectsService } from './card-effects.service';
import { CardEffectsController } from './card-effects.controller';

@Module({
  imports: [],
  providers: [CardEffectsService],
  controllers: [CardEffectsController],
})
export class CardEffectsModule {}
