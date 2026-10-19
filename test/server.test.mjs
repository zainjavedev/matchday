import test from 'node:test';
import assert from 'node:assert/strict';

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
const DATA = path.join(os.tmpdir(), `matchday-test-${process.pid}.json`);
process.env.DATA_FILE = DATA;
const { hashPassword, verifyPassword, normEmail, validEmail, validPassword } = await import('../server/password.js');
const { cleanFollows, cleanSettings } = await import('../server/validate.js');
const { dueReminders, emailFor, pushPayload } = await import('../server/reminders.js');
const store = await import('../server/store.js');
const { runReminders } = await import('../server/runReminders.js');

const NOW = Date.parse('2026-10-20T12:00:00Z');
const ev = (id, mins, over = {}) => ({ id, sport: 'nba', start: NOW + mins * 60000, end: NOW + mins * 60000 + 9e6, timeValid: true, state: 'pre', followIds: ['nba:13'], league: 'NBA', kind: 'match', sides: [{ short: 'Lakers' }, { short: 'Warriors' }], ...over });

test('passwords: salted hash verifies, wrong one fails, no plaintext', async () => {
  const h = await hashPassword('correct horse');
  assert.ok(!h.includes('correct horse'));
  assert.notEqual(h, await hashPassword('correct horse'));
  assert.equal(await verifyPassword('correct horse', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('input validation', () => {
  assert.equal(normEmail('  Zain@Example.COM '), 'zain@example.com');
  assert.ok(validEmail('a@b.co') && !validEmail('nope') && !validEmail('a@b'));
  assert.ok(validPassword('12345678') && !validPassword('short'));
  assert.deepEqual(cleanFollows(['nba:13', 'nba:13', 'x', '<script>', 'soccer:83', 5]), ['nba:13', 'soccer:83']);
  assert.deepEqual(cleanSettings({ lead: 30, evil: 1, theme: 'neon', email: false, tz: 'Asia/Karachi' }), { lead: 30, email: false, tz: 'Asia/Karachi' });
});

test('every game is due inside the lead window — once, followed teams only', () => {
  const user = { id: 1, follows: ['nba:13'], settings: { lead: 30 } };
  const events = [ev('soon', 20), ev('far', 90), ev('started', -5), ev('tbd', 20, { timeValid: false }), ev('other', 20, { followIds: ['nba:9'] }), ev('done', 20, { state: 'post' })];
  const due = dueReminders({ users: [user], events, sent: new Set(), now: NOW });
  assert.deepEqual(due.map((d) => d.event.id), ['soon']);
  assert.equal(dueReminders({ users: [user], events, sent: new Set([due[0].key]), now: NOW }).length, 0);
  // default lead is 30 when the user never chose one
  assert.equal(dueReminders({ users: [{ id: 2, follows: ['nba:13'], settings: {} }], events: [ev('s', 29)], sent: new Set(), now: NOW }).length, 1);
});

test('email + push content use the user\'s timezone and plain wording', () => {
  const user = { id: 1, settings: { tzDevice: 'Asia/Karachi' } };
  const items = [{ event: ev('a', 20, { start: Date.parse('2026-10-20T19:00:00Z') }) }];
  const m = emailFor(user, items, { siteUrl: 'https://x', now: NOW });
  assert.match(m.text, /Lakers vs Warriors/);
  assert.match(m.text, /00:00|12:00/); // 19:00Z is midnight in Karachi
  assert.match(pushPayload(ev('a', 20), NOW).body, /starts in 20 min/);
});

test('JSON store: users, sessions and push subscriptions persist to disk and survive a reload', () => {
  const u = store.createUser({ email: 'a@x.com', pwHash: 'h' });
  assert.equal(store.createUser({ email: 'a@x.com', pwHash: 'other' }), null, 'duplicate email rejected');
  store.updateUser(u.id, { follows: ['nba:13'], settings: { lead: 60 } });
  store.addSession('tok', u.id, Date.now() + 1000);
  store.addSession('old', u.id, Date.now() - 1000);
  assert.equal(store.userForSession('tok').email, 'a@x.com');
  assert.equal(store.userForSession('old'), null, 'expired session ignored');
  store.upsertPush('https://p/1', u.id, { endpoint: 'https://p/1', keys: {} });
  store.upsertPush('https://p/1', u.id, { endpoint: 'https://p/1', keys: { a: 1 } });
  assert.equal(store.pushForUser(u.id).length, 1, 'same endpoint is not duplicated');

  store.resetStore(); // simulate a server restart: reload from the file
  assert.deepEqual(store.findUserByEmail('a@x.com').follows, ['nba:13']);
  assert.equal(store.userForSession('tok').id, u.id);
  assert.equal(JSON.parse(fs.readFileSync(DATA, 'utf8')).users.length, 1);

  store.removeSession('tok');
  assert.equal(store.userForSession('tok'), null);
  fs.writeFileSync(DATA, '{not json');
  store.resetStore();
  assert.throws(() => store.findUserByEmail('a@x.com'), /Could not read/, 'a corrupt file is an error, never silently emptied');
  fs.rmSync(DATA);
  store.resetStore();
});

test('runReminders against the store: delivers once, honours email-off, retries failures', async () => {
  for (const [email, follows, settings] of [['on@x.com', ['nba:13'], { lead: 30 }], ['off@x.com', ['nba:13'], { email: false }], ['none@x.com', [], {}]]) {
    const u = store.createUser({ email, pwHash: 'h' });
    store.updateUser(u.id, { follows, settings });
  }
  const mails = [];
  const opts = { now: NOW, events: [ev('g1', 20)], mail: async (m) => mails.push(m.to), push: async () => 0 };

  const r1 = await runReminders(opts);
  assert.deepEqual(mails, ['on@x.com']); // email-off user skipped, empty-follows user ignored
  assert.equal(r1.due, 2);
  const r2 = await runReminders(opts);
  assert.equal(mails.length, 1, 'no duplicate on the next run');
  assert.equal(r2.due, 0);

  // email fails and there is no push device -> not marked sent, so it is retried
  let calls = 0;
  const flaky = { ...opts, events: [ev('g2', 20)], mail: async () => { if (calls++ === 0) throw new Error('smtp down'); } };
  await runReminders(flaky);
  assert.equal(calls, 1);
  await runReminders(flaky);
  assert.equal(calls, 2, 'retried after failure');
  fs.rmSync(DATA, { force: true });
});
