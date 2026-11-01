# BrainSightAI API

Authentication and role-based user management for the BrainSightAI Android client.

The database stores **identity only** — MRI inference runs on-device and no scan data is
ever uploaded or persisted.

| | |
|---|---|
| Framework | NestJS 12 (TypeScript, `strict`) |
| Database | PostgreSQL (Neon) via Prisma 7 + `@prisma/adapter-pg` (driver adapter, no Rust engine) |
| Auth | Short-lived JWT access tokens + rotating opaque refresh tokens (SHA-256 at rest) |
| API docs | Swagger UI at `/api/docs` (non-production only) |
| Tests | 22 unit + 36 e2e (supertest) — the e2e suite runs the full HTTP surface against an in-memory Prisma stand-in, so no database is needed in CI |

## Project structure

```
src/
├── main.ts               bootstrap: create app, configureApp(), shutdown hooks
├── configure-app.ts      helmet, CORS allow-list, api/v1 prefix, Swagger
├── app.module.ts         ConfigModule + global pipe + global guards (order matters)
├── config/               typed app.* config namespace + fail-fast env validation
├── prisma/               @Global PrismaModule / PrismaService (connect, health probe)
├── common/               decorators (@Public, @Roles, @CurrentUser), guards, shared DTO/mapper
├── auth/                 register / login / refresh / logout / me
│   ├── dto/              request + response contracts (ValidationPipe + Swagger)
│   └── strategies/       passport-jwt strategy — re-reads the user on every request
├── users/                admin-only account listing, role grants, enable/disable
├── models/               model catalogue: ADMIN manages, RADIOLOGIST authors, USER reads
├── cli/                  seed.ts — bootstraps the first administrator
└── health/               liveness + database reachability (503 when Postgres is down)
```

Feature modules are self-contained; only `PrismaModule` is global. Reusable request-time
building blocks (`@Public()`, `@Roles()`, `@CurrentUser()`, the guards) live in
`common/` so no feature has to import another feature to authenticate a request.

## Setup

```bash
npm install                 # runs `prisma generate` via postinstall
cp .env.example .env        # then fill in DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
npm run prisma:migrate      # create the schema (needs a reachable Postgres)
npm run seed:admin          # create the first ADMIN — see below
npm run start:dev           # watch mode on http://localhost:3000/api/v1
```

### First administrator

No HTTP path can mint an `ADMIN` (`POST /auth/register` always assigns `USER` and
`PATCH /users/:id/role` is admin-gated), so a fresh database needs one seed run:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='Str0ngPass!' npm run seed:admin
```

The password follows the same policy as registration (8–72 characters with an
uppercase, a lowercase and a digit). The script is idempotent: re-running it on an
existing account promotes it to `ADMIN` and resets its password, and says so. It also
runs automatically after `prisma migrate deploy` (see `prisma7.config.ts`).
Because the generated Prisma client is TypeScript, the script compiles the project
first — that is what the `npm run build &&` in `seed:admin` is for.

Environment variables are validated once at boot (`src/config/env.validation.ts`); the
process refuses to start if anything is missing, malformed, or if the two JWT secrets
are identical. `.env` is git-ignored and must never be committed.

## Scripts

| Command | Purpose |
|---|---|
| `npm run build` / `start:dev` / `start:prod` | Compile / develop / run `dist/main` |
| `npm test` / `npm run test:e2e` / `npm run test:cov` | Unit / HTTP e2e / coverage |
| `npm run lint` / `npm run lint:check` | ESLint + Prettier (fix / verify) |
| `npm run prisma:migrate` / `prisma:deploy` / `prisma:studio` | Schema migrations & inspection |
| `npm run seed:admin` | Build, then create/promote the first administrator (`ADMIN_EMAIL` + `ADMIN_PASSWORD`) |

## HTTP surface

All routes are prefixed `api/v1`.

| Method | Route | Access |
|---|---|---|
| GET | `/` | public — service index |
| GET | `/health` | public — 503 when the database is unreachable |
| POST | `/auth/register` | public, 5/min/IP — always creates a `USER` |
| POST | `/auth/login` | public, 5/min/IP |
| POST | `/auth/refresh` | public, 10/min/IP — rotates the refresh token |
| POST | `/auth/logout` | public — idempotent revocation |
| GET | `/auth/me` | authenticated |
| GET | `/users`, `/users/:id` | `ADMIN` |
| PATCH | `/users/:id/role`, `/users/:id/status` | `ADMIN` (self-service blocked; sessions revoked on demotion/disable) |

Authentication is **deny-by-default**: `JwtAuthGuard` is registered once as a global
`APP_GUARD`, so a new controller is private unless it carries `@Public()`. `RolesGuard`
runs after it and only activates where `@Roles(...)` is declared.

## Deployment (Render)

The API is deployed as a Render web service at
**https://bsa-backend-poiu.onrender.com** (health check:
`/api/v1/health`). Render builds from `main` and redeploys on every push.

Service settings:

| Setting | Value |
|---|---|
| Build command | `npm ci --include=dev && npm run prisma:generate && npm run build` |
| Start command | `npm run prisma:deploy && node dist/main` |
| Health check path | `/api/v1/health` |

Environment variables (set in Render → Environment):

- `NODE_ENV=production`
- `DATABASE_URL` — Neon pooled connection string (`...?sslmode=require`)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — 32+ characters and must differ
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — first administrator, used by the seed step
- Optional: `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `BCRYPT_ROUNDS`, `CORS_ORIGINS`

Render injects `PORT`; the app binds to `0.0.0.0`. Free instances spin down after
inactivity, so the first request after a while can take ~30–60s.

The Android client uses this URL as its default `BASE_URL` (see
`BrainSightAI/app/build.gradle.kts`). HTTPS is required — `network_security_config.xml`
forbids cleartext to public hosts.

## Related documentation

Cross-cutting audit material lives in the repository root: [`../docs/AUDIT.md`](../docs/AUDIT.md)
and [`../docs/BUGS.md`](../docs/BUGS.md).
