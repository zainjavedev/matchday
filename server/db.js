// Postgres. DATABASE_URL set -> a real server (Neon, Railway, the Docker Postgres on your VPS).
// Not set -> an embedded Postgres (PGlite) in .data/, so local dev needs no setup.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  pw_hash TEXT NOT NULL,
  follows JSONB NOT NULL DEFAULT '[]',
  settings JSONB NOT NULL DEFAULT '{}',
  fail_count INT NOT NULL DEFAULT 0,
  locked_until BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sub JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS sent (
  key TEXT PRIMARY KEY,
  at BIGINT NOT NULL
);`;

async function open() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined });
    await pool.query(SCHEMA);
    return { query: (text, params) => pool.query(text, params), close: () => pool.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR ?? '.data/pg';
  if (!dir.startsWith('memory://')) (await import('node:fs')).mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.exec(SCHEMA);
  return { query: (text, params) => pg.query(text, params), close: () => pg.close() };
}

// One connection per process, even across Next.js dev reloads.
export const db = () =>
  (globalThis.__mdDb ??= open().catch((err) => {
    globalThis.__mdDb = undefined; // don't cache a failed connection forever
    throw err;
  }));
export const q = async (text, params) => (await db()).query(text, params);
