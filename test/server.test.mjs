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

test('JSON store: users, sessions and push subscriptions persist to disk and survive a reload', async () => {
  const u = await store.createUser({ email: 'a@x.com', pwHash: 'h' });
  assert.equal(await store.createUser({ email: 'a@x.com', pwHash: 'other' }), null, 'duplicate email rejected');
  await store.updateUser(u.id, { follows: ['nba:13'], settings: { lead: 60 } });
  await store.addSession('tok', u.id, Date.now() + 1000);
  await store.addSession('old', u.id, Date.now() - 1000);
  assert.equal((await store.userForSession('tok')).email, 'a@x.com');
  assert.equal(await store.userForSession('old'), null, 'expired session ignored');
  await store.upsertPush('https://p/1', u.id, { endpoint: 'https://p/1', keys: {} });
  await store.upsertPush('https://p/1', u.id, { endpoint: 'https://p/1', keys: { a: 1 } });
  assert.equal((await store.pushForUser(u.id)).length, 1, 'same endpoint is not duplicated');

  store.resetStore(); // simulate a server restart: reload from the file
  assert.deepEqual((await store.findUserByEmail('a@x.com')).follows, ['nba:13']);
  assert.equal((await store.userForSession('tok')).id, u.id);
  assert.equal(JSON.parse(fs.readFileSync(DATA, 'utf8')).users.length, 1);

  await store.removeSession('tok');
  assert.equal(await store.userForSession('tok'), null);
  fs.writeFileSync(DATA, '{not json');
  store.resetStore();
  await assert.rejects(() => store.findUserByEmail('a@x.com'), /Could not read/, 'a corrupt file is an error, never silently emptied');
  fs.rmSync(DATA);
  store.resetStore();
});

test('runReminders against the store: delivers once, honours email-off, retries failures', async () => {
  for (const [email, follows, settings] of [['on@x.com', ['nba:13'], { lead: 30 }], ['off@x.com', ['nba:13'], { email: false }], ['none@x.com', [], {}]]) {
    const u = await store.createUser({ email, pwHash: 'h' });
    await store.updateUser(u.id, { follows, settings });
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

test('Redis store: same behaviour as the file store, against a fake Upstash server', async () => {
  const kv = new Map();
  const hash = (k) => kv.get(k) ?? kv.set(k, new Map()).get(k);
  const run = ([c, k, ...a]) => {
    switch (c) {
      case 'GET': return kv.get(k) ?? null;
      case 'SET': if (a[1] === 'NX' && kv.has(k)) return null; kv.set(k, a[0]); return 'OK';
      case 'INCR': kv.set(k, String(Number(kv.get(k) ?? 0) + 1)); return Number(kv.get(k));
      case 'DEL': kv.delete(k); return 1;
      case 'SADD': kv.set(k, [...new Set([...(kv.get(k) ?? []), a[0]])]); return 1;
      case 'SMEMBERS': return kv.get(k) ?? [];
      case 'MGET': return [k, ...a].map((x) => kv.get(x) ?? null);
      case 'HSET': for (let i = 0; i < a.length; i += 2) hash(k).set(a[i], a[i + 1]); return 1;
      case 'HGET': return hash(k).get(a[0]) ?? null;
      case 'HMGET': return a.map((f) => hash(k).get(f) ?? null);
      case 'HVALS': return [...hash(k).values()];
      case 'HGETALL': return [...hash(k)].flat();
      case 'HDEL': for (const f of a) hash(k).delete(f); return 1;
      default: throw new Error(`fake redis: ${c}`);
    }
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => ({ ok: true, json: async () => ({ result: run(JSON.parse(init.body)) }) });
  process.env.KV_REST_API_URL = 'https://fake';
  process.env.KV_REST_API_TOKEN = 't';
  try {
    assert.equal(store.storeKind(), 'redis');
    const u = await store.createUser({ email: 'r@x.com', pwHash: 'h' });
    assert.equal(await store.createUser({ email: 'r@x.com', pwHash: 'o' }), null, 'duplicate email rejected');
    await store.updateUser(u.id, { follows: ['nba:13'] });
    assert.deepEqual((await store.findUserByEmail('r@x.com')).follows, ['nba:13']);
    assert.equal((await store.usersWithFollows()).length, 1);
    await store.addSession('tok', u.id, Date.now() + 5000);
    assert.equal((await store.userForSession('tok')).id, u.id);
    await store.removeSession('tok');
    assert.equal(await store.userForSession('tok'), null);
    await store.upsertPush('https://p/1', u.id, { endpoint: 'https://p/1', keys: {} });
    await store.upsertPush('https://p/1', u.id, { endpoint: 'https://p/1', keys: { a: 1 } });
    assert.equal((await store.pushForUser(u.id)).length, 1);
    await store.removePush('https://p/1', u.id + 99); // someone else's device: ignored
    assert.equal((await store.pushForUser(u.id)).length, 1);
    await store.removePush('https://p/1', u.id);
    assert.equal((await store.pushForUser(u.id)).length, 0);
    await store.markSent(['a', 'b'], 100);
    assert.deepEqual([...(await store.sentAmong(['a', 'c']))], ['a']);
    await store.pruneSent(200);
    assert.equal((await store.sentAmong(['a', 'b'])).size, 0);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  }
});

test('Blob store: same behaviour again, against an in-memory fake of @vercel/blob', async () => {
  const files = new Map();
  const fake = {
    async get(p) { return files.has(p) ? { statusCode: 200, stream: new Response(files.get(p).body).body } : null; },
    async put(p, body, o) {
      if (files.has(p) && !o.allowOverwrite) throw new Error(`This blob already exists: ${p}`);
      files.set(p, { body, uploadedAt: new Date(files.get(p)?.uploadedAt ?? Date.now()) });
      return { pathname: p };
    },
    async del(ps) { for (const p of [ps].flat()) files.delete(p); },
    async list({ prefix }) { return { hasMore: false, blobs: [...files].filter(([p]) => p.startsWith(prefix)).map(([pathname, f]) => ({ pathname, uploadedAt: f.uploadedAt })) }; },
  };
  store.useBlobClient(fake);
  process.env.BLOB_READ_WRITE_TOKEN = 'rw_fake';
  try {
    assert.equal(store.storeKind(), 'blob');
    const u = await store.createUser({ email: 'b@x.com', pwHash: 'h' });
    assert.equal(await store.createUser({ email: 'b@x.com', pwHash: 'o' }), null, 'duplicate email rejected');
    await store.updateUser(u.id, { follows: ['nba:13'] });
    assert.deepEqual((await store.findUserByEmail('b@x.com')).follows, ['nba:13']);
    assert.equal((await store.usersWithFollows()).length, 1);
    await store.addSession('tok', u.id, Date.now() + 5000);
    await store.addSession('old', u.id, Date.now() - 1000);
    assert.equal((await store.userForSession('tok')).id, u.id);
    assert.equal(await store.userForSession('old'), null, 'expired session ignored');
    await store.removeSession('tok');
    assert.equal(await store.userForSession('tok'), null);
    await store.upsertPush('https://p/1', u.id, { endpoint: 'https://p/1', keys: {} });
    await store.upsertPush('https://p/1', u.id, { endpoint: 'https://p/1', keys: { a: 1 } });
    assert.equal((await store.pushForUser(u.id)).length, 1);
    await store.removePush('https://p/1', 'someone-else');
    assert.equal((await store.pushForUser(u.id)).length, 1);
    await store.removePush('https://p/1', u.id);
    assert.equal((await store.pushForUser(u.id)).length, 0);
    await store.markSent(['a', 'b'], 100);
    assert.deepEqual([...(await store.sentAmong(['a', 'c']))], ['a']);
    await store.pruneSent(Date.now() + 1000);
    assert.equal((await store.sentAmong(['a', 'b'])).size, 0);
  } finally {
    store.useBlobClient(undefined);
    delete process.env.BLOB_READ_WRITE_TOKEN;
  }
});
