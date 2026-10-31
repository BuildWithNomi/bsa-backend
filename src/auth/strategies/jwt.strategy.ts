import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/app.config';
import { PrismaService } from '../../prisma/prisma.service';
import type { Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Claims carried by the access token. Mirrors what `AuthService` signs. */
interface AccessTokenPayload {
  sub: string;
  email: string;
  fullName: string;
  role: Role;
  typ: 'access';
}

/**
 * Validates `Authorization: Bearer …` access tokens.
 *
 * The database is consulted on every request rather than trusting the token's `role`
 * claim: disabling an account or demoting a user takes effect immediately instead of
 * at token expiry.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const { jwtAccessSecret } = configService.getOrThrow<AppConfig>('app');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtAccessSecret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (!payload || payload.typ !== 'access' || !payload.sub) {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }
}
