import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzleNeon<typeof schema>>;

function create(): DB {
  // Both clients connect lazily, so a missing URL only fails on first query (keeps `next build` working).
  const url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/outward';
  // Neon over HTTP; anything else (Supabase, local Postgres) via postgres-js.
  if (/\.neon\.tech/.test(url)) return drizzleNeon(neon(url), { schema });
  // prepare: false is required by Supabase's transaction pooler (port 6543), which is what serverless should use.
  return drizzlePg(postgres(url, { max: 5, prepare: false }), { schema }) as unknown as DB;
}

const g = globalThis as unknown as { __outwardDb?: DB };
export const db: DB = (g.__outwardDb ??= create());

export { schema };
