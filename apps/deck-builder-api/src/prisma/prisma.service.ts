import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { createPrismaAdapter } from '../../prisma/prisma-adapter.factory';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: createPrismaAdapter(),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
