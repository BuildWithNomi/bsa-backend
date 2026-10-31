import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
  bcryptRounds: number;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlSeconds: number;
}

/**
 * Namespaced (`app.*`) access to configuration.
 *
 * Values are read here only; everything else goes through `ConfigService.getOrThrow`.
 * Defaults are defined after `env.validation.ts` has already rejected bad input, so a
 * fallback here can never silently mask a missing variable.
 */
export default registerAs('app', (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://localhost:3000,http://localhost:8080'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL ?? '',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  jwtAccessTtlSeconds: Number(process.env.JWT_ACCESS_TTL ?? 900),
  jwtRefreshTtlSeconds: Number(process.env.JWT_REFRESH_TTL ?? 2_592_000),
}));
