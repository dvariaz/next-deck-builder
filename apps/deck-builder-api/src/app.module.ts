import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CardsModule } from './cards/cards.module';
import { PrismaModule } from './prisma/prisma.module';
import { SearchGraphModule } from './search-graph/search-graph.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    CardsModule,
    SearchGraphModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
