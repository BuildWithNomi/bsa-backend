import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import type { AppConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  app.enableShutdownHooks();

  const { port } = app.get(ConfigService).getOrThrow<AppConfig>('app');
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  // Configuration errors (bad/missing env) land here — fail loudly instead of idling.
  console.error('Fatal error during bootstrap:', error);
  process.exitCode = 1;
});
