import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { type Role } from '../generated/prisma/client';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const APP_CONFIG = {
  nodeEnv: 'test',
  port: 3000,
  corsOrigins: [],
  databaseUrl: 'postgresql://user:pass@localhost:5432/test',
  bcryptRounds: 4,
  jwtAccessSecret: 'x'.repeat(40),
  jwtRefreshSecret: 'y'.repeat(40),
  jwtAccessTtlSeconds: 900,
  jwtRefreshTtlSeconds: 2_592_000,
};

const META = { userAgent: 'jest', ipAddress: '127.0.0.1' };

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TokenRow {
  id: string;
  tokenHash: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'you@example.com',
    fullName: 'Noman Khan',
    passwordHash: 'unused',
    role: 'USER',
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * In-memory stand-in for the Prisma client — only the calls `AuthService` makes.
 * Implementations return real promises (rather than being `async`) so the mock's type
 * stays `Promise<…>` and `mockRejectedValueOnce` remains usable.
 */
function createPrismaMock() {
  const users: UserRow[] = [];
  const tokens: TokenRow[] = [];

  return {
    users,
    tokens,
    user: {
      findUnique: jest.fn(
        (args: {
          where: { id?: string; email?: string };
        }): Promise<UserRow | null> => {
          const key = args.where.id ? 'id' : 'email';
          const value = args.where.id ?? args.where.email;
          return Promise.resolve(
            users.find((row) => row[key] === value) ?? null,
          );
        },
      ),
      create: jest.fn(
        (args: { data: Record<string, unknown> }): Promise<UserRow> => {
          const email = String(args.data.email);
          if (users.some((row) => row.email === email)) {
            return Promise.reject(
              Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
            );
          }
          const row = makeUser({
            email,
            fullName: String(args.data.fullName),
            passwordHash: String(args.data.passwordHash),
          });
          users.push(row);
          return Promise.resolve(row);
        },
      ),
      update: jest.fn(
        (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }): Promise<UserRow> => {
          const row = users.find((candidate) => candidate.id === args.where.id);
          if (!row)
            return Promise.reject(new Error('Record to update not found'));
          Object.assign(row, args.data, { updatedAt: new Date() });
          return Promise.resolve(row);
        },
      ),
    },
    refreshToken: {
      findUnique: jest.fn(
        (args: {
          where: { tokenHash: string };
          include?: { user: boolean };
        }): Promise<(TokenRow & { user?: UserRow }) | null> => {
          const token = tokens.find(
            (row) => row.tokenHash === args.where.tokenHash,
          );
          if (!token) return Promise.resolve(null);
          if (!args.include?.user) return Promise.resolve(token);
          const owner = users.find((row) => row.id === token.userId);
          return Promise.resolve(owner ? { ...token, user: owner } : null);
        },
      ),
      create: jest.fn(
        (args: {
          data: Omit<TokenRow, 'id' | 'createdAt' | 'revokedAt'>;
        }): Promise<TokenRow> => {
          const row: TokenRow = {
            id: `token-${tokens.length + 1}`,
            createdAt: new Date(),
            revokedAt: null,
            ...args.data,
          };
          tokens.push(row);
          return Promise.resolve(row);
        },
      ),
      update: jest.fn(
        (args: {
          where: { id: string };
          data: { revokedAt: Date };
        }): Promise<TokenRow> => {
          const row = tokens.find(
            (candidate) => candidate.id === args.where.id,
          );
          if (!row)
            return Promise.reject(new Error('Record to update not found'));
          row.revokedAt = args.data.revokedAt;
          return Promise.resolve(row);
        },
      ),
      updateMany: jest.fn(
        (args: {
          where: {
            id?: string;
            tokenHash?: string;
            userId?: string;
            revokedAt?: null;
          };
          data: { revokedAt: Date };
        }): Promise<{ count: number }> => {
          let count = 0;
          for (const row of tokens) {
            if (args.where.id && row.id !== args.where.id) continue;
            if (args.where.tokenHash && row.tokenHash !== args.where.tokenHash)
              continue;
            if (args.where.userId && row.userId !== args.where.userId) continue;
            if (row.revokedAt !== null) continue;
            row.revokedAt = args.data.revokedAt;
            count += 1;
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let signAsync: jest.Mock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    signAsync = jest.fn((payload: Record<string, unknown>) =>
      Promise.resolve(`jwt:${String(payload.sub)}`),
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync } },
        { provide: ConfigService, useValue: { getOrThrow: () => APP_CONFIG } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  const validRegister: RegisterDto = {
    fullName: 'Noman Khan',
    email: '  You@Example.COM ',
    password: 'Str0ngPass!',
  };

  describe('register', () => {
    it('normalizes the email and stores only a bcrypt hash', async () => {
      const response = await service.register(validRegister, META);

      expect(prisma.users).toHaveLength(1);
      expect(prisma.users[0].email).toBe('you@example.com');
      expect(prisma.users[0].passwordHash).not.toBe('Str0ngPass!');
      expect(
        await bcrypt.compare('Str0ngPass!', prisma.users[0].passwordHash),
      ).toBe(true);
      expect(response.user.role).toBe('USER');
      expect(response.refreshToken).toHaveLength(64);
      expect(response.expiresIn).toBe(900);
    });

    it('always assigns USER even if a role is smuggled through', async () => {
      const response = await service.register(
        { ...validRegister, ...({ role: 'ADMIN' } as object) },
        META,
      );

      expect(response.user.role).toBe('USER');
    });

    it('rejects an already-registered address with 401 (no account enumeration)', async () => {
      await service.register(validRegister, META);

      await expect(service.register(validRegister, META)).rejects.toMatchObject(
        {
          status: 401,
        },
      );
    });

    it('maps a unique-index race to the same 401', async () => {
      jest
        .spyOn(prisma.user, 'create')
        .mockRejectedValueOnce(
          Object.assign(new Error('race'), { code: 'P2002' }),
        );

      await expect(service.register(validRegister, META)).rejects.toMatchObject(
        {
          status: 401,
        },
      );
    });

    it('records the client fingerprint on the issued refresh token', async () => {
      await service.register(validRegister, META);

      expect(prisma.tokens[0]).toMatchObject({
        userAgent: META.userAgent,
        ipAddress: META.ipAddress,
        revokedAt: null,
      });
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await service.register(validRegister, META);
      prisma.tokens.length = 0;
    });

    it('accepts valid credentials and stamps lastLoginAt', async () => {
      const response = await service.login(
        {
          email: 'YOU@example.com',
          password: 'Str0ngPass!',
        } satisfies LoginDto,
        META,
      );

      expect(response.accessToken).toBe(`jwt:${prisma.users[0].id}`);
      expect(prisma.users[0].lastLoginAt).toBeInstanceOf(Date);
    });

    it('rejects a wrong password', async () => {
      await expect(
        service.login(
          { email: 'you@example.com', password: 'Nope1234!' },
          META,
        ),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('rejects an unknown address with the identical message', async () => {
      const unknown = await service
        .login({ email: 'nobody@example.com', password: 'Whatever1!' }, META)
        .catch((error: { message: string }) => error.message);

      const wrongPassword = await service
        .login({ email: 'you@example.com', password: 'WrongPass1!' }, META)
        .catch((error: { message: string }) => error.message);

      expect(unknown).toBe(wrongPassword);
      expect(unknown).toBe('Invalid email or password');
    });

    it('rejects a disabled account', async () => {
      prisma.users[0].isActive = false;

      await expect(
        service.login(
          { email: 'you@example.com', password: 'Str0ngPass!' },
          META,
        ),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const response = await service.register(validRegister, META);
      refreshToken = response.refreshToken;
    });

    it('rotates: the presented token is revoked and a new one issued', async () => {
      const response = await service.refresh(refreshToken, META);

      expect(response.refreshToken).not.toBe(refreshToken);
      expect(prisma.tokens).toHaveLength(2);
      expect(prisma.tokens[0].revokedAt).toBeInstanceOf(Date);
      expect(prisma.tokens[1].revokedAt).toBeNull();
    });

    it('rejects a replayed (already rotated) token', async () => {
      await service.refresh(refreshToken, META);

      await expect(service.refresh(refreshToken, META)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('fails closed when it loses the rotation race', async () => {
      // Simulates a concurrent request having claimed the token between our read and
      // our write: the guarded update matches nothing, so no second session may exist.
      jest
        .spyOn(prisma.refreshToken, 'updateMany')
        .mockResolvedValueOnce({ count: 0 });

      await expect(service.refresh(refreshToken, META)).rejects.toMatchObject({
        status: 401,
      });
      expect(prisma.tokens).toHaveLength(1);
    });

    it('rejects an unknown token', async () => {
      await expect(service.refresh('z'.repeat(64), META)).rejects.toMatchObject(
        { status: 401 },
      );
    });

    it('rejects an expired token', async () => {
      prisma.tokens[0].expiresAt = new Date(Date.now() - 1_000);

      await expect(service.refresh(refreshToken, META)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('rejects tokens belonging to a disabled account', async () => {
      prisma.users[0].isActive = false;

      await expect(service.refresh(refreshToken, META)).rejects.toMatchObject({
        status: 401,
      });
    });
  });

  describe('logout', () => {
    it('revokes the token and is idempotent for unknown tokens', async () => {
      const { refreshToken } = await service.register(validRegister, META);

      await expect(service.logout(refreshToken)).resolves.toEqual({
        success: true,
      });
      expect(prisma.tokens[0].revokedAt).toBeInstanceOf(Date);

      await expect(service.logout('n'.repeat(64))).resolves.toEqual({
        success: true,
      });
    });
  });

  describe('me', () => {
    it('returns the profile without password material', async () => {
      const { user } = await service.register(validRegister, META);
      const profile = await service.me(user.id);

      expect(profile).toMatchObject({
        id: user.id,
        email: 'you@example.com',
        role: 'USER',
      });
      expect(profile).not.toHaveProperty('passwordHash');
    });

    it('fails for a disabled account', async () => {
      const { user } = await service.register(validRegister, META);
      prisma.users[0].isActive = false;

      await expect(service.me(user.id)).rejects.toMatchObject({ status: 401 });
    });
  });
});
