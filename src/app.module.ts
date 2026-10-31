import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import type { AppConfig } from './config/app.config';
import appConfig from './config/app.config';
import { validate } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { ModelsModule } from './models/models.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

/**
 * Guard order matters: abuse control runs before credential checks so an attacker
 * cannot burn CPU on bcrypt by hammering an authenticated endpoint.
 */
const GLOBAL_GUARDS = [
  { provide: APP_GUARD, useClass: ThrottlerGuard },
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
];

/**
 * Deny-by-default input contract: unknown properties are a 400 rather than a silent
 * strip, so a contract drift on the Android side fails loudly instead of vanishing.
 * Registered as `APP_PIPE` so *every* bootstrap path gets it.
 */
const GLOBAL_VALIDATION = {
  provide: APP_PIPE,
  useValue: new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }),
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate,
      load: [appConfig],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        // Deterministic test runs must not trip the limiter mid-suite; the rate-limit
        // e2e case flips `E2E_ENABLE_THROTTLE` per request to verify it for real.
        skipIf: () =>
          configService.getOrThrow<AppConfig>('app').nodeEnv === 'test' &&
          process.env.E2E_ENABLE_THROTTLE !== 'true',
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ModelsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, GLOBAL_VALIDATION, ...GLOBAL_GUARDS],
})
export class AppModule {}
