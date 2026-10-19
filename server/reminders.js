// Pure logic: no database, no network. Tested in test/server.test.mjs.
import { titleOf } from '../src/lib/title.js';
import { SPORTS } from '../src/lib/sports.js';

export const DEFAULT_LEAD = 30;
export const leadOf = (user) => (typeof user.settings?.lead === 'number' ? user.settings.lead : DEFAULT_LEAD);

/**
 * Every game of every followed team is reminded by default.
 * Due once now >= start - lead, until the game starts. `sent` holds keys already delivered.
 */
export function dueReminders({ users, events, sent, now }) {
  const due = [];
  for (const user of users) {
    const mine = new Set(user.follows);
    const lead = leadOf(user);
    for (const e of events) {
      if (!e.timeValid || e.state !== 'pre' || e.start <= now) continue;
      if (!e.followIds.some((id) => mine.has(id))) continue;
      if (now < e.start - lead * 60000) continue;
      const key = `${user.id}:${e.id}:${lead}`;
      if (!sent.has(key)) due.push({ user, event: e, key });
    }
  }
  return due;
}

export const phrase = (mins) => {
  if (mins <= 0) return 'is starting now';
  if (mins < 60) return `starts in ${mins} min`;
  return `starts in ${Math.round(mins / 60)}h`;
};

export const pushPayload = (event, now) => ({
  title: `${SPORTS[event.sport].emoji} ${titleOf(event)}`,
  body: `${event.league} ${phrase(Math.round((event.start - now) / 60000))}`,
  tag: event.id,
  url: '/',
});

const zoneFor = (user) => {
  const tz = user.settings?.tz && user.settings.tz !== 'auto' ? user.settings.tz : user.settings?.tzDevice;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
};

export function emailFor(user, items, { siteUrl, now }) {
  const tz = zoneFor(user);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const lines = items.map(({ event: e }) => `${SPORTS[e.sport].emoji} ${titleOf(e)}\n   ${e.league} · ${fmt.format(e.start)} (${phrase(Math.round((e.start - now) / 60000))})`);
  return {
    subject: items.length === 1 ? `${titleOf(items[0].event)} ${phrase(Math.round((items[0].event.start - now) / 60000))}` : `${items.length} games starting soon`,
    text: `${lines.join('\n\n')}\n\nYour timeline: ${siteUrl}\nChange or turn off emails in Settings.\n`,
  };
}
