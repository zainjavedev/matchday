// Pure logic, so it can be tested without Cloudflare.
export const titleOf = (e) => (e.kind === 'session' ? `F1 · ${e.raceName} — ${e.session}` : e.sides.map((s) => s.short).join(' vs '));

/**
 * Which (subscriber, event, lead) reminders are due right now and not yet sent?
 * A reminder is due once `now >= start - lead`, until the game starts.
 */
export function dueReminders({ subs, events, sent, now }) {
  const due = [];
  for (const sub of subs) {
    if (!sub.confirmed) continue;
    const mine = new Set(sub.follows);
    for (const e of events) {
      if (!e.timeValid || e.state !== 'pre' || e.start <= now) continue;
      if (!e.followIds.some((id) => mine.has(id))) continue;
      if (now < e.start - sub.lead * 60000) continue;
      const key = `${sub.id}:${e.id}:${sub.lead}`;
      if (sent.has(key)) continue;
      due.push({ sub, event: e, key });
    }
  }
  return due;
}

export const emailFor = (sub, items, { siteUrl, apiUrl }) => {
  const when = (e) => new Date(e.start).toUTCString().replace(':00 GMT', ' UTC');
  const lines = items.map(({ event: e }) => `• ${titleOf(e)} — ${e.league}\n  ${when(e)}`);
  const unsub = `${apiUrl}/unsubscribe?id=${sub.id}&t=${sub.token}`;
  return {
    subject: items.length === 1 ? `Starting soon: ${titleOf(items[0].event)}` : `${items.length} games starting soon`,
    text: `${lines.join('\n\n')}\n\nSee your full timeline: ${siteUrl}\nStop these emails: ${unsub}\n`,
  };
};
