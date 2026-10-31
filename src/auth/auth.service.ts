import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import type { AppConfig } from '../config/app.config';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma/client';
import { toUserResponse } from '../common/mappers/user.mapper';
import type { UserResponseDto } from '../common/dto/user-response.dto';
import type { AuthResponse } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { RequestMeta } from './types/request-meta';

/** SHA-256 hex — the only form a refresh token ever takes on disk. */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly cfg: AppConfig;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {
    this.cfg = configService.getOrThrow<AppConfig>('app');
  }

  /**
   * Creates an account.
   *
   * The `role` field is intentionally absent from `RegisterDto`: a caller can never
   * self-assign `ADMIN` or `RADIOLOGIST`. Promotion happens only through
   * `PATCH /api/v1/users/:id/role`, which is admin-gated.
   */
  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Same message for "exists" and "no such account" on login keeps enumeration out.
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.cfg.bcryptRounds);

    try {
      const user = await this.prisma.user.create({
        data: { email, fullName: dto.fullName.trim(), passwordHash },
      });

      return this.issueTokens(user, meta);
    } catch (error) {
      // Unique index race: two simultaneous registrations for one address.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw error;
    }
  }

  /** Verifies credentials and starts a refresh-token session. */
  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user, meta);
  }

  /**
   * Rotates a refresh token: the presented token is revoked and a brand new one issued.
   * Rotation limits the value of a stolen token — reuse of a revoked token is rejected.
   */
  async refresh(rawToken: string, meta: RequestMeta): Promise<AuthResponse> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!record.user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Claim the token atomically. A `findUnique` + `update` pair left a window where two
    // concurrent requests carrying the same refresh token both passed the `revokedAt`
    // check above and both walked away with a fresh session; the guarded `updateMany`
    // lets exactly one caller win and turns the loser into a plain 401.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claimed.count !== 1) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.issueTokens(record.user, meta);
  }

  /**
   * Revokes the presented refresh token. Idempotent: an unknown token still returns
   * success so a client can always clear its local state without leaking validity.
   */
  async logout(rawToken: string): Promise<{ success: true }> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  /** The caller's own profile, re-read from the database on every request. */
  async me(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    return toUserResponse(user);
  }

  private async issueTokens(
    user: User,
    meta: RequestMeta,
  ): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        typ: 'access',
      },
      { expiresIn: this.cfg.jwtAccessTtlSeconds },
    );

    // 48 bytes of CSPRNG entropy → 64-char base64url string.
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.cfg.jwtRefreshTtlSeconds * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.cfg.jwtAccessTtlSeconds,
      user: toUserResponse(user),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
