import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '../generated/prisma/client';

/**
 * Bootstrap the first administrator.
 *
 * The API deliberately has no HTTP path that mints an ADMIN (`POST /auth/register`
 * always assigns USER and `PATCH /users/:id/role` is admin-gated), so on a fresh
 * database this script is the only way in.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='Str0ngPass!' npm run seed:admin
 *   (also runs automatically via `prisma migrate deploy` — see prisma7.config.ts)
 *
 * Idempotent: an existing account is promoted to ADMIN and its password reset, which
 * is reported loudly. The password must satisfy the same policy as `RegisterDto`.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Same rule as `RegisterDto`: at least one lowercase, one uppercase and one digit. */
const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;

function fail(message: string): never {
  console.error(`\n  seed:admin — ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('DATABASE_URL is not set — copy .env.example to .env first.');
  }

  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const fullName = (process.env.ADMIN_FULL_NAME ?? 'Administrator').trim();
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  if (!EMAIL_PATTERN.test(email)) {
    fail('ADMIN_EMAIL must be a valid email address.');
  }
  if (
    password.length < MIN_PASSWORD ||
    password.length > MAX_PASSWORD ||
    !PASSWORD_COMPLEXITY.test(password)
  ) {
    fail(
      `ADMIN_PASSWORD must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters with an ` +
        'uppercase letter, a lowercase letter and a digit (same policy as the API).',
    );
  }
  if (!fullName || fullName.length > 80) {
    fail('ADMIN_FULL_NAME must be 1–80 characters.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    // Identical to the API's own hash so login behaves exactly as for a registered user.
    const passwordHash = await bcrypt.hash(password, rounds);
    const existing = await prisma.user.findUnique({ where: { email } });

    if (!existing) {
      const created = await prisma.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          role: Role.ADMIN,
          isActive: true,
        },
      });
      console.log(`seed:admin — created ${created.email} with role ADMIN`);
      return;
    }

    const promoted = await prisma.user.update({
      where: { id: existing.id },
      data: { fullName, passwordHash, role: Role.ADMIN, isActive: true },
    });

    console.log(`seed:admin — updated existing account ${promoted.email}`);
    console.log(
      'seed:admin —   role set to ADMIN, password reset, account enabled',
    );
    if (promoted.role !== Role.ADMIN || !promoted.isActive) {
      throw new Error(
        'verification failed: the account is not an active ADMIN',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('seed:admin failed:', error);
  process.exitCode = 1;
});
