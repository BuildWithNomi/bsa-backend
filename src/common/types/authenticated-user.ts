import type { Role } from '../../generated/prisma/client';

/**
 * The verified principal attached to every authenticated request by `JwtStrategy`.
 * Deliberately carries **no** password material and no refresh-token state.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
