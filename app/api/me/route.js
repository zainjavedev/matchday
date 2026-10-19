import { NextResponse } from 'next/server';
import { q } from '../../../server/db.js';
import { currentUser, publicUser } from '../../../server/session.js';
import { cleanFollows, cleanSettings } from '../../../server/validate.js';
import { pushEnabled } from '../../../server/push.js';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { rows } = await q('SELECT 1 FROM push_subs WHERE user_id = $1 LIMIT 1', [user.id]);
  return NextResponse.json({ user: publicUser(user), push: { configured: pushEnabled(), anyDevice: rows.length > 0 } });
}

export async function PUT(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const follows = cleanFollows(body.follows);
  const settings = cleanSettings(body.settings);
  await q('UPDATE users SET follows = $1, settings = $2 WHERE id = $3', [JSON.stringify(follows), JSON.stringify(settings), user.id]);
  return NextResponse.json({ ok: true });
}
