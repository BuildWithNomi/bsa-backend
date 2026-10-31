import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserResponseDto } from '../common/dto/user-response.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponse } from './dto/auth-response.dto';

/**
 * Authentication endpoints.
 *
 * All routes except `GET /me` are `@Public()` because they *establish* credentials;
 * the global `JwtAuthGuard` still guards everything else in the API.
 * Credential endpoints are throttled to 5 attempts / minute / IP to slow brute force.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Always assigns the USER role — roles are granted by an administrator, never by the client.',
  })
  @ApiCreatedResponse({ type: AuthResponse })
  async register(
    @Body() body: RegisterDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.authService.register(body, { ipAddress, userAgent });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for a token pair' })
  @ApiOkResponse({ type: AuthResponse })
  async login(
    @Body() body: LoginDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.authService.login(body, { ipAddress, userAgent });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token and mint a new access token',
    description:
      'The presented refresh token is revoked as part of the exchange; replaying it fails.',
  })
  @ApiOkResponse({ type: AuthResponse })
  async refresh(
    @Body() body: RefreshDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.authService.refresh(body.refreshToken, {
      ipAddress,
      userAgent,
    });
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token (idempotent)' })
  @ApiOkResponse({
    schema: { properties: { success: { type: 'boolean', example: true } } },
  })
  async logout(@Body() body: LogoutDto): Promise<{ success: true }> {
    return this.authService.logout(body.refreshToken);
  }

  @Get('me')
  @ApiOperation({ summary: 'Profile of the authenticated caller' })
  @ApiBearerAuth('access-token')
  @ApiOkResponse({ type: UserResponseDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.authService.me(user.id);
  }
}
