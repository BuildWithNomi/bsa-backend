import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a handler (or an entire controller) to the listed roles.
 * Requires `RolesGuard`, which is registered globally in `AppModule`.
 *
 * ```ts
 * @Roles(Role.ADMIN)
 * @Get('users')
 * listUsers() { … }
 * ```
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
