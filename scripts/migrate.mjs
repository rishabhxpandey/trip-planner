// Applies pending drizzle/*.sql migrations. Runs before `next build` on Vercel production deploys
// (see "vercel-build" in package.json); preview deploys share the database, so they skip it.
// Uses the same history table as `npm run db:migrate` (drizzle.__drizzle_migrations), so the two never double-apply.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const onVercel = !!process.env.VERCEL_ENV;
if (onVercel && process.env.VERCEL_ENV !== 'production') {
  console.log(`[migrate] Skipping on ${process.env.VERCEL_ENV} deploy.`);
  process.exit(0);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is not set.');
  process.exit(1);
}

// prepare: false for Supabase's transaction pooler, same as lib/db/index.ts.
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
  console.log('[migrate] Database is up to date.');
} catch (e) {
  console.error('[migrate] Failed, so the deploy stops here and the live site keeps running the previous version.');
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
