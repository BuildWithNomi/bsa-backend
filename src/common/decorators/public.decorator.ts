import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint as reachable without a JWT.
 *
 * Authentication is **deny-by-default**: `JwtAuthGuard` is registered globally, so every
 * route requires a valid access token unless it carries this decorator.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
