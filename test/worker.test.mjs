import test from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, emailFor } from '../worker/reminders.js';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const ev = (id, minsFromNow, over = {}) => ({ id, start: NOW + minsFromNow * 60000, timeValid: true, state: 'pre', followIds: ['nba:13'], league: 'NBA', kind: 'match', sides: [{ short: 'A' }, { short: 'B' }], ...over });
const sub = { id: 's1', confirmed: true, follows: ['nba:13'], lead: 30, token: 't' };

test('due only inside the lead window, once, and only for confirmed followers', () => {
  const events = [ev('soon', 20), ev('far', 90), ev('started', -5), ev('tbd', 20, { timeValid: false }), ev('other', 20, { followIds: ['nba:9'] }), ev('done', 20, { state: 'post' })];
  const due = dueReminders({ subs: [sub, { ...sub, id: 's2', confirmed: false }], events, sent: new Set(), now: NOW });
  assert.deepEqual(due.map((d) => d.event.id), ['soon']);
  assert.equal(due[0].key, 's1:soon:30');
  assert.equal(dueReminders({ subs: [sub], events, sent: new Set(['s1:soon:30']), now: NOW }).length, 0);
});

test('digest email groups games and carries an unsubscribe link', () => {
  const items = [ev('a', 10), ev('b', 15)].map((event) => ({ sub, event }));
  const m = emailFor(sub, items, { siteUrl: 'https://site', apiUrl: 'https://api' });
  assert.match(m.subject, /2 games/);
  assert.match(m.text, /unsubscribe\?id=s1&t=t/);
});
