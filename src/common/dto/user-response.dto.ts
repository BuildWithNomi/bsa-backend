import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

/**
 * The subset of a user that is ever sent over the wire.
 * `passwordHash` and token records are structurally impossible to leak through this type.
 */
export class UserResponseDto {
  @ApiProperty({ example: '6f1d0b3e-4a68-4a5a-9a0b-1b7e3f0d1c22' })
  id!: string;

  @ApiProperty({ example: 'you@example.com' })
  email!: string;

  @ApiProperty({ example: 'Noman Khan' })
  fullName!: string;

  @ApiProperty({
    description: 'RBAC role granted by an administrator',
    enum: Role,
    enumName: 'Role',
    example: Role.USER,
  })
  role!: Role;

  @ApiProperty({ description: 'Disabled accounts cannot log in or refresh' })
  isActive!: boolean;
}
