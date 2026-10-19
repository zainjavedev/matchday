import { NextResponse } from 'next/server';
import { createUser, findUserByEmail, updateUser } from '../../../server/store.js';
import { hashPassword, normEmail, validEmail, validPassword, verifyPassword } from '../../../server/password.js';
import { endSession, publicUser, startSession } from '../../../server/session.js';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const LOCK_AFTER = 8;
const LOCK_MS = 15 * 60000;

export async function POST(request) {
  try {
    return await handle(request);
  } catch (err) {
    console.error('[auth]', err);
    return fail(err.message?.startsWith('This app stores') ? err.message : 'The server could not save your account. Try again in a moment.', 500);
  }
}

async function handle(request) {
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
    const user = createUser({ email, pwHash: await hashPassword(password) });
    if (!user) return fail('That email already has an account — log in instead.', 409);
    await startSession(user.id);
    return NextResponse.json({ user: publicUser(user) });
  }

  const user = findUserByEmail(email);
  if (user && user.lockedUntil > Date.now()) return fail('Too many attempts. Try again in a few minutes.', 429);
  const ok = user ? await verifyPassword(String(password ?? ''), user.pwHash) : (await hashPassword('x'), false); // same work either way
  if (!ok) {
    if (user) {
      const fails = user.failCount + 1;
      updateUser(user.id, { failCount: fails % LOCK_AFTER, lockedUntil: fails >= LOCK_AFTER ? Date.now() + LOCK_MS : 0 });
    }
    return fail('Wrong email or password.', 401);
  }
  updateUser(user.id, { failCount: 0, lockedUntil: 0 });
  await startSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
