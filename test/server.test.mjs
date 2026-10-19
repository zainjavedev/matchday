import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_DIR = 'memory://';
const { hashPassword, verifyPassword, normEmail, validEmail, validPassword } = await import('../server/password.js');
const { cleanFollows, cleanSettings } = await import('../server/validate.js');
const { dueReminders, emailFor, pushPayload } = await import('../server/reminders.js');
const { q, db } = await import('../server/db.js');
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

test('runReminders against a real database: delivers once, honours email-off, retries failures', async () => {
  await q(`INSERT INTO users (email, pw_hash, follows, settings, created_at) VALUES
    ('on@x.com','h','["nba:13"]','{"lead":30}',1),
    ('off@x.com','h','["nba:13"]','{"email":false}',1),
    ('none@x.com','h','[]','{}',1)`);
  const mails = [];
  const pushes = [];
  const opts = { now: NOW, events: [ev('g1', 20)], mail: async (m) => mails.push(m.to), push: async (id) => (pushes.push(id), 0) };

  const r1 = await runReminders(opts);
  assert.deepEqual(mails, ['on@x.com']); // email-off user skipped, empty-follows user ignored
  assert.equal(r1.due, 2);
  const r2 = await runReminders(opts);
  assert.equal(mails.length, 1, 'no duplicate on the next run');
  assert.equal(r2.due, 0);

  // failure: email fails and no push device -> not marked sent, retried
  let calls = 0;
  const flaky = { ...opts, events: [ev('g2', 20)], mail: async () => { if (calls++ === 0) throw new Error('smtp down'); } };
  await runReminders(flaky);
  assert.equal((await q(`SELECT count(*)::int AS n FROM sent WHERE key LIKE '%:g2:%'`)).rows[0].n, 1); // only the email-off user's
  await runReminders(flaky);
  assert.equal(calls, 2, 'retried after failure');
  await (await db()).close();
});
