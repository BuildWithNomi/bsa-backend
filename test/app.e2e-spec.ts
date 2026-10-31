import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { type Role } from '../src/generated/prisma/client';

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

interface ModelRow {
  id: string;
  name: string;
  version: string;
  task: string;
  labels: string[];
  description: string | null;
  downloadUrl: string | null;
  sizeBytes: number | null;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Response shapes — mirrors the Swagger DTOs in `src/`. */
interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

interface ModelBody {
  id: string;
  name: string;
  version: string;
  task: string;
  labels: string[];
  description: string | null;
  downloadUrl: string | null;
  sizeBytes: number | null;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthBody {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserProfile;
}

interface IndexBody {
  name: string;
  version: string;
  status: string;
  docs: string;
  health: string;
}

interface HealthBody {
  status: string;
  database: string;
  timestamp: string;
  uptimeSeconds: number;
}

interface UserListBody {
  items: UserProfile[];
  total: number;
  limit: number;
  offset: number;
}

interface ApiError {
  statusCode: number;
  message: string | string[];
}

/**
 * `supertest` types `.body` as `any`. Narrowing happens exactly once, here, so every
 * assertion below is checked against a declared shape instead of drifting silently.
 */
const json = <T>(response: { body: unknown }): T => response.body as T;

/**
 * In-memory Prisma stand-in.
 *
 * The suite exercises HTTP routing, guards, pipes, JWT signing and password hashing for
 * real; only the storage layer is substituted, so no Neon instance is required to run CI.
 * Implementations return real promises rather than being `async`, which keeps their mock
 * types as `Promise<…>` (so `mockResolvedValueOnce` works) and satisfies `require-await`.
 */
function createFakePrisma() {
  const users: UserRow[] = [];
  const tokens: TokenRow[] = [];
  const models: ModelRow[] = [];
  let sequence = 0;

  const nextId = (): string =>
    `${(++sequence).toString().padStart(8, '0')}-0000-4000-8000-000000000000`;

  return {
    users,
    tokens,
    /** Mirrors `PrismaService.isDatabaseReachable` — `HealthController` calls this directly. */
    isDatabaseReachable: jest.fn((): Promise<boolean> => Promise.resolve(true)),
    user: {
      findUnique: jest.fn(
        (args: {
          where: { id?: string; email?: string };
        }): Promise<UserRow | null> => {
          const match = args.where.id
            ? (row: UserRow) => row.id === args.where.id
            : (row: UserRow) => row.email === args.where.email;
          return Promise.resolve(users.find(match) ?? null);
        },
      ),
      create: jest.fn(
        (args: { data: Record<string, unknown> }): Promise<UserRow> => {
          const email = String(args.data.email);
          if (users.some((row) => row.email === email)) {
            return Promise.reject(
              Object.assign(new Error('Unique constraint failed'), {
                code: 'P2002',
              }),
            );
          }
          const now = new Date();
          const row: UserRow = {
            id: nextId(),
            email,
            fullName: String(args.data.fullName),
            passwordHash: String(args.data.passwordHash),
            role: 'USER',
            isActive: true,
            lastLoginAt: null,
            createdAt: now,
            updatedAt: now,
          };
          users.push(row);
          return Promise.resolve(row);
        },
      ),
      update: jest.fn(
        (args: {
          where: { id: string };
          data: Partial<UserRow>;
        }): Promise<UserRow> => {
          const row = users.find((candidate) => candidate.id === args.where.id);
          if (!row)
            return Promise.reject(new Error('Record to update not found'));
          Object.assign(row, args.data, { updatedAt: new Date() });
          return Promise.resolve(row);
        },
      ),
      count: jest.fn((): Promise<number> => Promise.resolve(users.length)),
      findMany: jest.fn(
        (args: { skip?: number; take?: number }): Promise<UserRow[]> =>
          Promise.resolve(
            users.slice(
              args.skip ?? 0,
              (args.skip ?? 0) + (args.take ?? users.length),
            ),
          ),
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
            id: `token-${nextId()}`,
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
    classifierModel: {
      findMany: jest.fn(
        (args?: {
          where?: { isActive?: boolean };
          orderBy?: unknown;
        }): Promise<ModelRow[]> => {
          const activeFilter = args?.where?.isActive;
          const rows = models.filter((row) =>
            activeFilter === undefined ? true : row.isActive === activeFilter,
          );
          rows.sort(
            (a, b) =>
              Number(b.isActive) - Number(a.isActive) ||
              b.createdAt.getTime() - a.createdAt.getTime(),
          );
          return Promise.resolve(rows);
        },
      ),
      findUnique: jest.fn(
        (args: {
          where: { id?: string; name?: string };
        }): Promise<ModelRow | null> => {
          const key = args.where.id ? 'id' : 'name';
          const value = args.where.id ?? args.where.name;
          return Promise.resolve(
            models.find((row) => row[key] === value) ?? null,
          );
        },
      ),
      create: jest.fn(
        (args: {
          data: Omit<ModelRow, 'id' | 'createdAt' | 'updatedAt'>;
        }): Promise<ModelRow> => {
          if (models.some((row) => row.name === args.data.name)) {
            return Promise.reject(
              Object.assign(new Error('Unique constraint failed'), {
                code: 'P2002',
              }),
            );
          }
          const now = new Date();
          const row: ModelRow = {
            id: nextId(),
            ...args.data,
            createdAt: now,
            updatedAt: now,
          };
          models.push(row);
          return Promise.resolve(row);
        },
      ),
      update: jest.fn(
        (args: {
          where: { id: string };
          data: Partial<ModelRow>;
        }): Promise<ModelRow> => {
          const row = models.find(
            (candidate) => candidate.id === args.where.id,
          );
          if (!row)
            return Promise.reject(new Error('Record to update not found'));
          Object.assign(row, args.data, { updatedAt: new Date() });
          return Promise.resolve(row);
        },
      ),
      delete: jest.fn((args: { where: { id: string } }): Promise<ModelRow> => {
        const index = models.findIndex(
          (candidate) => candidate.id === args.where.id,
        );
        if (index < 0) {
          return Promise.reject(
            Object.assign(new Error('Record to delete does not exist'), {
              code: 'P2025',
            }),
          );
        }
        const [row] = models.splice(index, 1);
        return Promise.resolve(row);
      }),
    },
    $connect: jest.fn(() => Promise.resolve(undefined)),
    $disconnect: jest.fn(() => Promise.resolve(undefined)),
    $queryRaw: jest.fn(() => Promise.resolve([{ ok: 1 }])),
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
}

const ADMIN_EMAIL = 'admin@brainsight.ai';
const ADMIN_PASSWORD = 'Admin1234!';
const MEMBER_PASSWORD = 'Str0ngPass!';

describe('BrainSightAI API (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createFakePrisma>;

  let memberAccessToken: string;
  let memberRefreshToken: string;
  let memberId: string;
  let adminAccessToken: string;

  // `INestApplication.getHttpServer()` is typed `any` while supertest's parameter type
  // accepts it. Asserting a concrete type is auto-removed by
  // `no-unnecessary-type-assertion`, so the two rules cannot both be satisfied from
  // source alone; the value is a raw Node HTTP server by construction.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    prisma = createFakePrisma();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    // Seeded administrator — no HTTP registration path can ever mint an admin.
    prisma.users.push({
      id: '00000000-0000-4000-8000-000000000001',
      email: ADMIN_EMAIL,
      fullName: 'Site Admin',
      passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 4),
      role: 'ADMIN',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('service index & health', () => {
    it('serves the index under the versioned prefix', async () => {
      const response = await api().get('/api/v1').expect(200);

      expect(json<IndexBody>(response)).toMatchObject({
        name: 'BrainSightAI API',
        docs: '/api/docs',
        health: '/api/v1/health',
      });
    });

    it('reports database reachability at /api/v1/health', async () => {
      const response = await api().get('/api/v1/health').expect(200);

      expect(json<HealthBody>(response)).toMatchObject({
        status: 'ok',
        database: 'up',
      });
    });

    it('returns 503 when the database is unreachable', async () => {
      prisma.isDatabaseReachable.mockResolvedValueOnce(false);

      const response = await api().get('/api/v1/health').expect(503);

      expect(json<HealthBody>(response)).toMatchObject({
        database: 'down',
        status: 'degraded',
      });
    });
  });

  describe('OpenAPI, security headers and CORS', () => {
    it('publishes the OpenAPI document outside the versioned prefix', async () => {
      const response = await api().get('/api/docs-json').expect(200);

      const document = json<{
        openapi: string;
        paths: Record<string, unknown>;
        components?: { securitySchemes?: Record<string, unknown> };
      }>(response);

      expect(document.openapi).toMatch(/^3\./);
      expect(Object.keys(document.paths)).toEqual(
        expect.arrayContaining([
          '/api/v1/auth/register',
          '/api/v1/auth/login',
          '/api/v1/auth/refresh',
          '/api/v1/auth/me',
          '/api/v1/users',
        ]),
      );
      expect(document.components?.securitySchemes).toHaveProperty(
        'access-token',
      );
    });

    it('serves the interactive docs UI', async () => {
      const response = await api().get('/api/docs').expect(200);

      expect(response.text).toContain('swagger');
    });

    it('applies helmet security headers', async () => {
      const response = await api().get('/api/v1/health').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cross-origin-resource-policy']).toBe(
        'cross-origin',
      );
    });

    it('honours the configured CORS allow-list', async () => {
      const allowed = await api()
        .get('/api/v1')
        .set('Origin', 'http://localhost:3000')
        .expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );

      const rejected = await api()
        .get('/api/v1')
        .set('Origin', 'https://evil.example')
        .expect(200);
      expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rate-limits credential endpoints when throttling is active', async () => {
      process.env.E2E_ENABLE_THROTTLE = 'true';

      try {
        let throttled = false;

        for (let attempt = 0; attempt < 12 && !throttled; attempt += 1) {
          const response = await api()
            .post('/api/v1/auth/login')
            .send({ email: 'ayman@example.com', password: 'WrongPass1!' });
          throttled = response.status === 429;
        }

        expect(throttled).toBe(true);
      } finally {
        delete process.env.E2E_ENABLE_THROTTLE;
      }
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates a USER account and returns a token pair', async () => {
      const response = await api()
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Ayman Shaikh',
          email: 'ayman@example.com',
          password: MEMBER_PASSWORD,
        })
        .expect(201);

      const body = json<AuthBody>(response);

      expect(body.user).toMatchObject({
        email: 'ayman@example.com',
        fullName: 'Ayman Shaikh',
        role: 'USER',
      });
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.refreshToken).toHaveLength(64);
      expect(body.expiresIn).toBe(900);
      expect(body.user).not.toHaveProperty('passwordHash');

      memberAccessToken = body.accessToken;
      memberRefreshToken = body.refreshToken;
      memberId = body.user.id;
    });

    it('rejects a password below the complexity policy', async () => {
      const response = await api()
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Weak Pass',
          email: 'weak@example.com',
          password: 'abc',
        })
        .expect(400);

      expect(json<ApiError>(response).message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('at least 8 characters'),
        ]),
      );
    });

    it('rejects a malformed email', async () => {
      const response = await api()
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Bad Email',
          email: 'not-an-email',
          password: MEMBER_PASSWORD,
        })
        .expect(400);

      expect(json<ApiError>(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('valid email')]),
      );
    });

    it('rejects unknown properties instead of silently dropping them', async () => {
      const response = await api()
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Role Smuggler',
          email: 'smuggler@example.com',
          password: MEMBER_PASSWORD,
          role: 'ADMIN',
        })
        .expect(400);

      expect(json<ApiError>(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('role')]),
      );
      expect(
        prisma.users.some((row) => row.email === 'smuggler@example.com'),
      ).toBe(false);
    });

    it('refuses a duplicate address with 401 to avoid account enumeration', async () => {
      await api()
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Ayman Shaikh',
          email: 'ayman@example.com',
          password: MEMBER_PASSWORD,
        })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('rejects a wrong password', async () => {
      const response = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'ayman@example.com', password: 'NotThePass1!' })
        .expect(401);

      expect(json<ApiError>(response).message).toBe(
        'Invalid email or password',
      );
    });

    it('rejects an unknown account with the identical message', async () => {
      const response = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@example.com', password: 'Whatever123!' })
        .expect(401);

      expect(json<ApiError>(response).message).toBe(
        'Invalid email or password',
      );
    });

    it('accepts valid credentials', async () => {
      const response = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'ayman@example.com', password: MEMBER_PASSWORD })
        .expect(200);

      const body = json<AuthBody>(response);

      expect(body.user.role).toBe('USER');
      expect(body.accessToken).toEqual(expect.any(String));
      memberAccessToken = body.accessToken;
      memberRefreshToken = body.refreshToken;
    });

    it('requires both fields', async () => {
      const response = await api()
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);

      expect(json<ApiError>(response).message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Enter a valid email address'),
          expect.stringContaining('Password is required'),
        ]),
      );
    });

    it('logs in the seeded administrator', async () => {
      const response = await api()
        .post('/api/v1/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        .expect(200);

      const body = json<AuthBody>(response);

      expect(body.user.role).toBe('ADMIN');
      adminAccessToken = body.accessToken;
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('rejects requests without a token', async () => {
      await api().get('/api/v1/auth/me').expect(401);
    });

    it('rejects a garbage token', async () => {
      await api()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer nope')
        .expect(401);
    });

    it('returns the caller profile with a valid token', async () => {
      const response = await api()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${memberAccessToken}`)
        .expect(200);

      const profile = json<UserProfile>(response);

      expect(profile).toMatchObject({
        id: memberId,
        email: 'ayman@example.com',
      });
      expect(profile).not.toHaveProperty('passwordHash');
    });
  });

  describe('POST /api/v1/auth/refresh + logout', () => {
    let previousRefreshToken: string;

    it('rotates the refresh token', async () => {
      previousRefreshToken = memberRefreshToken;

      const response = await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: previousRefreshToken })
        .expect(200);

      const body = json<AuthBody>(response);

      expect(body.refreshToken).not.toBe(previousRefreshToken);
      memberRefreshToken = body.refreshToken;
      memberAccessToken = body.accessToken;
    });

    it('rejects replay of the previous token', async () => {
      await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: previousRefreshToken })
        .expect(401);
    });

    it('rejects a refresh token of the wrong shape', async () => {
      const response = await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'too-short' })
        .expect(400);

      expect(json<ApiError>(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('unexpected length')]),
      );
    });

    it('revokes the session on logout and stays idempotent', async () => {
      const refreshResponse = await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: memberRefreshToken })
        .expect(200);

      const currentToken = json<AuthBody>(refreshResponse).refreshToken;

      await api()
        .post('/api/v1/auth/logout')
        .send({ refreshToken: currentToken })
        .expect(200);

      await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: currentToken })
        .expect(401);

      const second = await api()
        .post('/api/v1/auth/logout')
        .send({ refreshToken: currentToken })
        .expect(200);

      expect(json<{ success: boolean }>(second)).toEqual({ success: true });
    });
  });

  describe('role-based access control', () => {
    it('forbids a USER from listing accounts', async () => {
      await api()
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${memberAccessToken}`)
        .expect(403);
    });

    it('forbids a USER from granting roles', async () => {
      await api()
        .patch(`/api/v1/users/${memberId}/role`)
        .set('Authorization', `Bearer ${memberAccessToken}`)
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('lets an ADMIN list accounts', async () => {
      const response = await api()
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      const list = json<UserListBody>(response);

      expect(list.total).toBeGreaterThanOrEqual(2);
      expect(list.items[0]).not.toHaveProperty('passwordHash');
    });

    it('validates pagination query parameters', async () => {
      await api()
        .get('/api/v1/users?limit=0')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(400);
    });

    it('lets an ADMIN grant RADIOLOGIST', async () => {
      const response = await api()
        .patch(`/api/v1/users/${memberId}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'RADIOLOGIST' })
        .expect(200);

      expect(json<UserProfile>(response).role).toBe('RADIOLOGIST');
    });

    it('rejects an unknown role value', async () => {
      await api()
        .patch(`/api/v1/users/${memberId}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'SUPERUSER' })
        .expect(400);
    });

    it('blocks an administrator from demoting themselves', async () => {
      const adminId = prisma.users.find((row) => row.email === ADMIN_EMAIL)!.id;

      const response = await api()
        .patch(`/api/v1/users/${adminId}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'USER' })
        .expect(400);

      expect(json<ApiError>(response).message).toContain(
        'cannot change your own role',
      );
    });

    it('rejects a malformed user id', async () => {
      await api()
        .patch('/api/v1/users/not-a-uuid/role')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'ADMIN' })
        .expect(400);
    });

    it('404s for an account that does not exist', async () => {
      await api()
        .get('/api/v1/users/11111111-1111-4111-8111-111111111111')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });
  });

  describe('model catalogue (RBAC)', () => {
    let viewerToken: string;
    let authorToken: string;
    let draftId: string;
    let publishedId: string;

    const BASE_MODEL = {
      version: '1.0.0',
      task: 'brain-tumor-classification',
      labels: ['glioma', 'meningioma', 'notumor', 'pituitary'],
      downloadUrl: 'https://models.brainsightai.app/mri/1.0.0/model.pt',
      sizeBytes: 2_129_951,
    };

    beforeAll(async () => {
      // A plain USER — never granted anything.
      const viewer = await api()
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Curious Viewer',
          email: 'viewer@example.com',
          password: MEMBER_PASSWORD,
        })
        .expect(201);
      viewerToken = json<AuthBody>(viewer).accessToken;

      // A RADIOLOGIST: promoted by the admin, then logged in again.
      const author = await api()
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Dr Radiologist',
          email: 'author@example.com',
          password: MEMBER_PASSWORD,
        })
        .expect(201);

      await api()
        .patch(`/api/v1/users/${json<AuthBody>(author).user.id}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'RADIOLOGIST' })
        .expect(200);

      const authorLogin = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'author@example.com', password: MEMBER_PASSWORD })
        .expect(200);
      authorToken = json<AuthBody>(authorLogin).accessToken;

      // ADMIN publishes one entry…
      const published = await api()
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'brain-tumor-mri', ...BASE_MODEL, isActive: true })
        .expect(201);
      publishedId = json<ModelBody>(published).id;

      // …and RADIOLOGIST leaves one as a draft.
      const draft = await api()
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ name: 'draft-model', ...BASE_MODEL, version: '0.9.0' })
        .expect(201);
      draftId = json<ModelBody>(draft).id;

      expect(json<ModelBody>(draft).isActive).toBe(false);
      expect(json<ModelBody>(draft).createdById).toEqual(expect.any(String));
    });

    it('rejects anonymous requests', async () => {
      await api().get('/api/v1/models').expect(401);
    });

    it('shows a USER published entries only', async () => {
      const response = await api()
        .get('/api/v1/models')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      const list = json<ModelBody[]>(response);

      expect(list.map((model) => model.name)).toEqual(['brain-tumor-mri']);
      expect(list[0]).not.toHaveProperty('passwordHash');
    });

    it('shows RADIOLOGIST and ADMIN the drafts as well', async () => {
      const authorList = json<ModelBody[]>(
        await api()
          .get('/api/v1/models')
          .set('Authorization', `Bearer ${authorToken}`)
          .expect(200),
      );
      const adminList = json<ModelBody[]>(
        await api()
          .get('/api/v1/models')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(200),
      );

      expect(authorList).toHaveLength(2);
      expect(adminList).toHaveLength(2);
    });

    it('hides a draft from a USER by id — 404, not 403', async () => {
      await api()
        .get(`/api/v1/models/${draftId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(404);

      await api()
        .get(`/api/v1/models/${draftId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);
    });

    it('forbids a USER from creating an entry', async () => {
      const response = await api()
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'sneaky-model', ...BASE_MODEL })
        .expect(403);

      expect(json<ApiError>(response).statusCode).toBe(403);
    });

    it('lets a RADIOLOGIST edit and publish their own entry', async () => {
      const response = await api()
        .patch(`/api/v1/models/${draftId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ version: '1.0.0', isActive: true })
        .expect(200);

      expect(json<ModelBody>(response)).toMatchObject({
        id: draftId,
        version: '1.0.0',
        isActive: true,
      });
    });

    it('forbids a RADIOLOGIST from deactivating', async () => {
      const response = await api()
        .patch(`/api/v1/models/${draftId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ isActive: false })
        .expect(403);

      expect(json<ApiError>(response).message).toContain(
        'Only an administrator can deactivate',
      );
    });

    it('lets an ADMIN deactivate and delete', async () => {
      const deactivated = await api()
        .patch(`/api/v1/models/${publishedId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ isActive: false })
        .expect(200);
      expect(json<ModelBody>(deactivated).isActive).toBe(false);

      await api()
        .delete(`/api/v1/models/${publishedId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      await api()
        .get(`/api/v1/models/${publishedId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });

    it('rejects a payload that violates the contract', async () => {
      const badVersion = await api()
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ name: 'bad-version', ...BASE_MODEL, version: 'v1' })
        .expect(400);
      expect(json<ApiError>(badVersion).message).toEqual(
        expect.arrayContaining([expect.stringContaining('semantic version')]),
      );

      const emptyLabels = await api()
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ name: 'no-labels', ...BASE_MODEL, labels: [] })
        .expect(400);
      expect(json<ApiError>(emptyLabels).message).toEqual(
        expect.arrayContaining([expect.stringContaining('must not be empty')]),
      );

      await api()
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ name: 'extra-field', ...BASE_MODEL, weights: 'blob' })
        .expect(400);
    });

    it('rejects a duplicate name with 409', async () => {
      const response = await api()
        .post('/api/v1/models')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'draft-model', ...BASE_MODEL })
        .expect(409);

      expect(json<ApiError>(response).message).toContain('already exists');
    });

    it('rejects a malformed or unknown id', async () => {
      await api()
        .get('/api/v1/models/not-a-uuid')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(400);

      await api()
        .get('/api/v1/models/11111111-1111-4111-8111-111111111111')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(404);
    });
  });

  describe('account disablement', () => {
    it('invalidates access tokens immediately, before they expire', async () => {
      // Sanity: the member is currently valid.
      await api()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${memberAccessToken}`)
        .expect(200);

      await api()
        .patch(`/api/v1/users/${memberId}/status`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ isActive: false })
        .expect(200);

      // Same, still-unexpired bearer token must now fail.
      await api()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${memberAccessToken}`)
        .expect(401);
    });

    it('blocks login for the disabled account', async () => {
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'ayman@example.com', password: MEMBER_PASSWORD })
        .expect(401);
    });
  });
});
