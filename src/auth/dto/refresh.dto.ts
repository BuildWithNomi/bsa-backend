import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description:
      'Opaque refresh token issued by register/login/refresh. 48 random bytes encoded as base64url (64 characters).',
    minLength: 32,
    maxLength: 256,
  })
  @IsString({ message: 'Refresh token must be a string' })
  @Length(32, 256, { message: 'Refresh token has an unexpected length' })
  refreshToken!: string;
}
