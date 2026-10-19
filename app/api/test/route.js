import { NextResponse } from 'next/server';
import { currentUser } from '../../../server/session.js';
import { sendMail } from '../../../server/mailer.js';
import { pushToUser } from '../../../server/push.js';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Settings → "Send a test": proves the email / this device really receive alerts.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { channel } = await request.json().catch(() => ({}));
  try {
    if (channel === 'email') {
      await sendMail({ to: user.email, subject: 'Matchday test', text: 'It works. Game reminders will arrive here.' });
      return NextResponse.json({ ok: true });
    }
    const n = await pushToUser(user.id, { title: '🎉 Matchday', body: 'It works. Game reminders will arrive here.', tag: 'test', url: '/' });
    return NextResponse.json({ ok: n > 0, devices: n });
  } catch (err) {
    return NextResponse.json({ error: 'Could not send.' }, { status: 502 });
  }
}
