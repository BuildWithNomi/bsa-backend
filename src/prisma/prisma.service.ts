import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { AppConfig } from '../config/app.config';

/**
 * Application-wide Prisma 7 client.
 *
 * Prisma 7 has no bundled Rust engine — it runs a WASM query compiler and talks to
 * Postgres through a driver adapter, so the connection string is handed to `PrismaPg`
 * rather than to the client directly.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const { databaseUrl } = configService.getOrThrow<AppConfig>('app');
    super({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Cheap liveness probe used by `GET /api/v1/health`.
   * Returns `false` instead of throwing so a flapping database can't crash the API.
   */
  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
