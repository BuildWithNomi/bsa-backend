import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { AppConfig } from './config/app.config';

/** Every public route lives under this prefix. */
export const API_PREFIX = 'api/v1';

/**
 * The complete HTTP surface configuration.
 *
 * Called by `main.ts` **and** the e2e suite, so integration tests exercise the same
 * prefix, CORS policy, security headers and Swagger document as production.
 * Input validation is *not* here — it is registered as a global `APP_PIPE` in
 * `AppModule` so it can never be forgotten by an alternative bootstrap.
 */
export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const { corsOrigins, nodeEnv } = configService.getOrThrow<AppConfig>('app');

  // Security headers. Swagger UI needs inline bootstrap/style, so CSP is relaxed just
  // enough for it; API responses are JSON and are unaffected either way.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix(API_PREFIX);

  if (nodeEnv !== 'production') {
    setupSwagger(app);
  }
}

function setupSwagger(app: INestApplication): void {
  const documentBuilder = new DocumentBuilder()
    .setTitle('BrainSightAI API')
    .setDescription(
      'Authentication and role-based user management for the BrainSightAI Android client. ' +
        'The database stores identities only — MRI inference runs on-device and no scan data is persisted.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Access token from POST /api/v1/auth/login',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, documentBuilder);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'BrainSightAI API docs',
  });
}
