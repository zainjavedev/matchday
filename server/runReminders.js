import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { markSent, pruneSent, sentAmong, usersWithFollows } from './store.js';
import { sendMail } from './mailer.js';
import { pushToUser } from './push.js';
import { dueReminders, emailFor, pushPayload } from './reminders.js';
import { loadEvents } from '../src/lib/sources.js';
import { F1_TEAM } from '../src/lib/sports.js';

let teamsCache;
const teamsById = async () => {
  if (!teamsCache) {
    const teams = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'teams.json'), 'utf8'));
    teamsCache = new Map([F1_TEAM, ...teams].map((t) => [t.id, t]));
  }
  return teamsCache;
};

// Overridable for tests: { now, events, mail, push }.
export async function runReminders(opts = {}) {
  const now = opts.now ?? Date.now();
  const mail = opts.mail ?? sendMail;
  const push = opts.push ?? pushToUser;

  const users = await usersWithFollows();
  if (!users.length) return { users: 0, due: 0 };

  const follows = [...new Set(users.flatMap((u) => u.follows))];
  const events = opts.events ?? (await loadEvents(follows, await teamsById())).events;

  const candidates = dueReminders({ users, events, sent: new Set(), now });
  if (!candidates.length) return { users: users.length, due: 0 };
  const already = await sentAmong(candidates.map((c) => c.key));
  const due = candidates.filter((c) => !already.has(c.key));

  const byUser = new Map();
  for (const d of due) byUser.set(d.user.id, [...(byUser.get(d.user.id) ?? []), d]);

  let emails = 0;
  let pushes = 0;
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
  for (const items of byUser.values()) {
    const { user } = items[0];
    let pushed = 0;
    for (const { event } of items) pushed += await push(user.id, pushPayload(event, now));
    pushes += pushed;
    let emailFailed = false;
    if (user.settings?.email !== false) {
      try {
        await mail({ to: user.email, ...emailFor(user, items, { siteUrl, now }) });
        emails++;
      } catch (err) {
        emailFailed = true;
        console.error('email failed', user.id, err.message); // retried on the next run
      }
    }
    // Keep it retryable only if email was the sole way to reach them and it failed.
    if (!emailFailed || pushed > 0) {
      markSent(items.map((i) => i.key), now);
    }
  }
  pruneSent(now - 7 * 86400000);
  return { users: users.length, due: due.length, emails, pushes };
}
