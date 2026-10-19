import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { addSession, removeSession, userForSession } from './store.js';

const COOKIE = 'md_session';
const DAYS = 180;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function startSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  addSession(sha(token), userId, Date.now() + DAYS * 86400000);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DAYS * 86400 });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) removeSession(sha(token));
  jar.delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? userForSession(sha(token)) : null;
}

export const publicUser = (u) => ({ email: u.email, follows: u.follows, settings: u.settings });
