import type { User } from '../../generated/prisma/client';
import type { UserResponseDto } from '../dto/user-response.dto';

/**
 * The single place a `User` row becomes a wire object.
 *
 * Every service that returns user data goes through here, so a new column can never
 * leak into an API response by accident — `passwordHash` and token records are
 * structurally impossible to expose through this shape.
 */
export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
  };
}
