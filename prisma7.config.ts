try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config');
} catch {
  // Host environment (Render, etc.) injects environment variables directly.
}
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `prisma migrate dev` / `prisma db seed` run this afterwards — see src/cli/seed.ts.
    // It builds first: the generated Prisma client is TypeScript and must be compiled.
    seed: 'npm run seed:admin',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
