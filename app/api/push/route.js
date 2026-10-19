import { NextResponse } from 'next/server';
import { removePush, upsertPush } from '../../../server/store.js';
import { currentUser } from '../../../server/session.js';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const valid = (s) => s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.keys?.p256dh && s.keys?.auth;

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const sub = await request.json().catch(() => null);
  if (!valid(sub)) return NextResponse.json({ error: 'Bad subscription.' }, { status: 400 });
  upsertPush(sub.endpoint, user.id, { endpoint: sub.endpoint, keys: sub.keys });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { endpoint } = await request.json().catch(() => ({}));
  if (endpoint) removePush(endpoint, user.id);
  return NextResponse.json({ ok: true });
}
