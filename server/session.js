import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { q } from './db.js';

const COOKIE = 'md_session';
const DAYS = 180;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function startSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + DAYS * 86400000;
  await q('INSERT INTO sessions (token_hash, user_id, expires) VALUES ($1, $2, $3)', [sha(token), userId, expires]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DAYS * 86400 });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]);
  jar.delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { rows } = await q(
    'SELECT u.id, u.email, u.follows, u.settings FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires > $2',
    [sha(token), Date.now()],
  );
  return rows[0] ?? null;
}

export const publicUser = (u) => ({ email: u.email, follows: u.follows, settings: u.settings });
