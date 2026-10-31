import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Role } from '../../generated/prisma/client';

export class UpdateUserRoleDto {
  @ApiProperty({
    description:
      'New role. USER scans on-device; RADIOLOGIST is a clinical reviewer; ADMIN manages accounts.',
    enum: Role,
    enumName: 'Role',
    example: Role.RADIOLOGIST,
  })
  @IsEnum(Role, { message: 'Role must be one of USER, RADIOLOGIST, ADMIN' })
  role!: Role;
}
