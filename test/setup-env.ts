/**
 * Runs before the test file is imported (see `setupFiles` in jest-e2e.json), because
 * `ConfigModule.forRoot()` validates `process.env` as soon as `AppModule` is evaluated.
 *
 * Values here mirror `.env.example` semantics but are inert: no real Neon instance is
 * ever touched by the test suite.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:5432/bsa_test';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-'.padEnd(48, 'a');
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-'.padEnd(48, 'b');
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
process.env.PORT ??= '3000';
