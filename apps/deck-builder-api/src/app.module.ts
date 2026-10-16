import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CardEffectsModule } from './card-effects/card-effects.module';
import { CardsModule } from './cards/cards.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    CardsModule,
    CardEffectsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
