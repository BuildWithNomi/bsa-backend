import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const NODE_ENVS = ['development', 'production', 'test'] as const;

/**
 * Contract for every environment variable the API reads.
 *
 * Validation runs once at boot (`ConfigModule.validate`) and the process refuses to
 * start when something is missing or malformed — a misconfigured deployment should
 * never come up "half working" (BUG-22).
 */
export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  @IsOptional()
  NODE_ENV?: (typeof NODE_ENVS)[number];

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT?: number;

  @IsString()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must be a postgresql:// connection string (Neon)',
  })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters',
  })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET must be at least 32 characters',
  })
  JWT_REFRESH_SECRET!: string;

  @IsInt()
  @Min(60, { message: 'JWT_ACCESS_TTL must be >= 60 seconds' })
  @Max(86400, { message: 'JWT_ACCESS_TTL must be <= 86400 seconds' })
  @IsOptional()
  JWT_ACCESS_TTL?: number;

  @IsInt()
  @Min(3600, { message: 'JWT_REFRESH_TTL must be >= 3600 seconds' })
  @Max(7776000, {
    message: 'JWT_REFRESH_TTL must be <= 7776000 seconds (90 days)',
  })
  @IsOptional()
  JWT_REFRESH_TTL?: number;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsInt()
  @Min(10, { message: 'BCRYPT_ROUNDS must be >= 10' })
  @Max(15, { message: 'BCRYPT_ROUNDS must be <= 15' })
  @IsOptional()
  BCRYPT_ROUNDS?: number;
}

/** Throws a single, readable error listing every offending variable. */
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(env, {
    skipMissingProperties: false,
    whitelist: false,
    forbidUnknownValues: false,
  });

  const messages = errors.map(
    (error) =>
      `  - ${error.property}: ${Object.values(error.constraints ?? {}).join('; ')}`,
  );

  if (
    env.DATABASE_URL &&
    env.JWT_ACCESS_SECRET &&
    env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET
  ) {
    messages.push('  - JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET');
  }

  if (messages.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${messages.join('\n')}`,
    );
  }

  return env;
}
