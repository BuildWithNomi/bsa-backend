import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description:
      'Refresh token to revoke. Unknown tokens are accepted and ignored.',
    minLength: 32,
    maxLength: 256,
  })
  @IsString({ message: 'Refresh token must be a string' })
  @Length(32, 256, { message: 'Refresh token has an unexpected length' })
  refreshToken!: string;
}
