import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../common/dto/user-response.dto';

/** Envelope returned by register / login / refresh. */
export class AuthResponse {
  @ApiProperty({
    description: 'Short-lived JWT sent as `Authorization: Bearer <token>`',
  })
  accessToken!: string;

  @ApiProperty({
    description:
      'Opaque rotating token stored encrypted on device; exchanged at POST /api/v1/auth/refresh',
  })
  refreshToken!: string;

  @ApiProperty({
    description: 'Access-token lifetime in seconds',
    example: 900,
  })
  expiresIn!: number;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
