import { NextResponse } from 'next/server';
import { q } from '../../../server/db.js';
import { currentUser } from '../../../server/session.js';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const valid = (s) => s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.keys?.p256dh && s.keys?.auth;

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const sub = await request.json().catch(() => null);
  if (!valid(sub)) return NextResponse.json({ error: 'Bad subscription.' }, { status: 400 });
  await q('INSERT INTO push_subs (endpoint, user_id, sub) VALUES ($1, $2, $3) ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, sub = $3', [sub.endpoint, user.id, JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys })]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { endpoint } = await request.json().catch(() => ({}));
  if (endpoint) await q('DELETE FROM push_subs WHERE endpoint = $1 AND user_id = $2', [endpoint, user.id]);
  return NextResponse.json({ ok: true });
}
