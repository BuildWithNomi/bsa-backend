import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    description:
      'false disables the account: login and refresh are rejected immediately and all refresh tokens are revoked.',
    example: true,
  })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive!: boolean;
}
