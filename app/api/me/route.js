import { NextResponse } from 'next/server';
import { pushForUser, updateUser } from '../../../server/store.js';
import { currentUser, publicUser } from '../../../server/session.js';
import { cleanFollows, cleanSettings } from '../../../server/validate.js';
import { pushEnabled } from '../../../server/push.js';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  return NextResponse.json({ user: publicUser(user), push: { configured: pushEnabled(), anyDevice: (await pushForUser(user.id)).length > 0 } });
}

export async function PUT(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const follows = cleanFollows(body.follows);
  const settings = cleanSettings(body.settings);
  updateUser(user.id, { follows, settings });
  return NextResponse.json({ ok: true });
}
