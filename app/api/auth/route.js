import { NextResponse } from 'next/server';
import { q } from '../../../server/db.js';
import { hashPassword, normEmail, validEmail, validPassword, verifyPassword } from '../../../server/password.js';
import { endSession, publicUser, startSession } from '../../../server/session.js';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const LOCK_AFTER = 8;
const LOCK_MS = 15 * 60000;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail('Bad request.');
  }
  const email = normEmail(body.email);
  const { password, mode } = body;
  if (!validEmail(email)) return fail('Enter a valid email address.');

  if (mode === 'signup') {
    if (!validPassword(password)) return fail('Password must be at least 8 characters.');
    const hash = await hashPassword(password);
    const { rows } = await q('INSERT INTO users (email, pw_hash, created_at) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id, email, follows, settings', [email, hash, Date.now()]);
    if (!rows[0]) return fail('That email already has an account — log in instead.', 409);
    await startSession(rows[0].id);
    return NextResponse.json({ user: publicUser(rows[0]) });
  }

  const { rows } = await q('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (user && user.locked_until > Date.now()) return fail('Too many attempts. Try again in a few minutes.', 429);
  const ok = user ? await verifyPassword(String(password ?? ''), user.pw_hash) : (await hashPassword('x'), false); // same work either way
  if (!ok) {
    if (user) {
      const fails = user.fail_count + 1;
      await q('UPDATE users SET fail_count = $1, locked_until = $2 WHERE id = $3', [fails % LOCK_AFTER, fails >= LOCK_AFTER ? Date.now() + LOCK_MS : 0, user.id]);
    }
    return fail('Wrong email or password.', 401);
  }
  await q('UPDATE users SET fail_count = 0, locked_until = 0 WHERE id = $1', [user.id]);
  await startSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
