// Three backends behind one async API:
//  - Upstash Redis (REST), used when KV_REST_API_URL / UPSTASH_REDIS_REST_URL is set. Works on Vercel.
//  - Vercel Blob (one small private JSON file per record), used when BLOB_READ_WRITE_TOKEN is set. Works on Vercel, zero config.
//  - A tiny JSON file (loaded into memory, rewritten atomically), for dev or ONE always-on server with a disk.
//    It does NOT persist on serverless hosts like Vercel, where the filesystem is read-only/ephemeral.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Serverless hosts can't keep this file. Fail loudly instead of losing accounts on the next cold start.
const assertPersistentHost = () => {
  if (process.env.VERCEL && !process.env.DATA_FILE) {
    throw new Error('This app stores data in a local file, which Vercel cannot keep. Add a Blob or Upstash Redis store to the project (see README) or host it on a server with a persistent disk.');
  }
};

const file = () => path.resolve(process.env.DATA_FILE ?? '.data/db.json');
const EMPTY = () => ({ nextId: 1, users: [], sessions: [], pushSubs: [], sent: {} });

function load() {
  try {
    return { ...EMPTY(), ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch (err) {
    if (err.code === 'ENOENT') return EMPTY();
    throw new Error(`Could not read ${file()}: ${err.message}`); // never silently start empty over a corrupt file
  }
}

// One copy per process, even across Next.js dev reloads.
const state = () => {
  assertPersistentHost();
  return (globalThis.__mdState ??= load());
};

function save() {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state()));
  fs.renameSync(tmp, f); // atomic: a crash can't leave half a file
}

export const resetStore = () => (globalThis.__mdState = undefined); // for tests

// ---- users
const file_findUserByEmail = (email) => state().users.find((u) => u.email === email) ?? null;
const file_findUserById = (id) => state().users.find((u) => u.id === id) ?? null;
const file_usersWithFollows = () => state().users.filter((u) => u.follows.length > 0);

function file_createUser({ email, pwHash }) {
  const s = state();
  if (file_findUserByEmail(email)) return null;
  const user = { id: s.nextId++, email, pwHash, follows: [], settings: {}, failCount: 0, lockedUntil: 0, createdAt: Date.now() };
  s.users.push(user);
  save();
  return user;
}

function file_updateUser(id, patch) {
  const u = file_findUserById(id);
  if (!u) return null;
  Object.assign(u, patch);
  save();
  return u;
}

// ---- sessions
function file_addSession(tokenHash, userId, expires) {
  const s = state();
  s.sessions = s.sessions.filter((x) => x.expires > Date.now()); // sweep expired ones as we go
  s.sessions.push({ tokenHash, userId, expires });
  save();
}

function file_userForSession(tokenHash) {
  const s = state().sessions.find((x) => x.tokenHash === tokenHash && x.expires > Date.now());
  return s ? file_findUserById(s.userId) : null;
}

function file_removeSession(tokenHash) {
  const s = state();
  s.sessions = s.sessions.filter((x) => x.tokenHash !== tokenHash);
  save();
}

// ---- push subscriptions
function file_upsertPush(endpoint, userId, sub) {
  const s = state();
  s.pushSubs = s.pushSubs.filter((p) => p.endpoint !== endpoint);
  s.pushSubs.push({ endpoint, userId, sub });
  save();
}

function file_removePush(endpoint, userId) {
  const s = state();
  s.pushSubs = s.pushSubs.filter((p) => !(p.endpoint === endpoint && (userId == null || p.userId === userId)));
  save();
}

const file_pushForUser = (userId) => state().pushSubs.filter((p) => p.userId === userId);

// ---- reminders already delivered
const file_sentAmong = (keys) => new Set(keys.filter((k) => k in state().sent));

function file_markSent(keys, at) {
  for (const k of keys) state().sent[k] = at;
  save();
}

function file_pruneSent(before) {
  const s = state();
  for (const k of Object.keys(s.sent)) if (s.sent[k] < before) delete s.sent[k];
  save();
}

const fileBackend = { findUserByEmail: file_findUserByEmail, findUserById: file_findUserById, usersWithFollows: file_usersWithFollows, createUser: file_createUser, updateUser: file_updateUser, addSession: file_addSession, userForSession: file_userForSession, removeSession: file_removeSession, upsertPush: file_upsertPush, removePush: file_removePush, pushForUser: file_pushForUser, sentAmong: file_sentAmong, markSent: file_markSent, pruneSent: file_pruneSent };

// ---- Upstash Redis backend (REST, no dependency). Per-entity keys, so concurrent requests don't overwrite each other.
const redisUrl = () => process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const redisToken = () => process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

async function cmd(...args) {
  const res = await fetch(redisUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(String)),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis: ${data.error ?? res.status}`);
  return data.result;
}

const K = { user: (id) => `md:user:${id}`, email: (e) => `md:email:${e}`, sess: (h) => `md:sess:${h}`, push: (id) => `md:push:${id}` };
const parse = (v) => (v == null ? null : JSON.parse(v));

const redisBackend = {
  async findUserById(id) {
    return parse(await cmd('GET', K.user(id)));
  },
  async findUserByEmail(email) {
    const id = await cmd('GET', K.email(email));
    return id ? redisBackend.findUserById(id) : null;
  },
  async usersWithFollows() {
    const ids = await cmd('SMEMBERS', 'md:users');
    if (!ids.length) return [];
    const rows = await cmd('MGET', ...ids.map(K.user));
    return rows.map(parse).filter((u) => u && u.follows.length > 0);
  },
  async createUser({ email, pwHash }) {
    const id = await cmd('INCR', 'md:nextId');
    if (!(await cmd('SET', K.email(email), id, 'NX'))) return null; // atomic duplicate check
    const user = { id, email, pwHash, follows: [], settings: {}, failCount: 0, lockedUntil: 0, createdAt: Date.now() };
    await cmd('SET', K.user(id), JSON.stringify(user));
    await cmd('SADD', 'md:users', id);
    return user;
  },
  async updateUser(id, patch) {
    const u = await redisBackend.findUserById(id);
    if (!u) return null;
    Object.assign(u, patch);
    await cmd('SET', K.user(id), JSON.stringify(u));
    return u;
  },
  async addSession(tokenHash, userId, expires) {
    const ttl = Math.max(1, Math.ceil((expires - Date.now()) / 1000));
    await cmd('SET', K.sess(tokenHash), userId, 'EX', ttl);
  },
  async userForSession(tokenHash) {
    const id = await cmd('GET', K.sess(tokenHash));
    return id ? redisBackend.findUserById(id) : null;
  },
  async removeSession(tokenHash) {
    await cmd('DEL', K.sess(tokenHash));
  },
  async upsertPush(endpoint, userId, sub) {
    const prev = await cmd('HGET', 'md:pushep', endpoint);
    if (prev && prev !== String(userId)) await cmd('HDEL', K.push(prev), endpoint);
    await cmd('HSET', K.push(userId), endpoint, JSON.stringify(sub));
    await cmd('HSET', 'md:pushep', endpoint, userId);
  },
  async removePush(endpoint, userId) {
    const owner = await cmd('HGET', 'md:pushep', endpoint);
    if (!owner || (userId != null && String(userId) !== owner)) return;
    await cmd('HDEL', K.push(owner), endpoint);
    await cmd('HDEL', 'md:pushep', endpoint);
  },
  async pushForUser(userId) {
    const subs = await cmd('HVALS', K.push(userId));
    return subs.map((v) => ({ endpoint: parse(v).endpoint, userId, sub: parse(v) }));
  },
  async sentAmong(keys) {
    if (!keys.length) return new Set();
    const vals = await cmd('HMGET', 'md:sent', ...keys);
    return new Set(keys.filter((_, i) => vals[i] != null));
  },
  async markSent(keys, at) {
    if (keys.length) await cmd('HSET', 'md:sent', ...keys.flatMap((k) => [k, at]));
  },
  async pruneSent(before) {
    const flat = await cmd('HGETALL', 'md:sent');
    const old = [];
    for (let i = 0; i < flat.length; i += 2) if (Number(flat[i + 1]) < before) old.push(flat[i]);
    if (old.length) await cmd('HDEL', 'md:sent', ...old);
  },
};

// ---- Vercel Blob backend: one private JSON blob per record. No-overwrite puts make email uniqueness atomic.
let blobClient;
const sdk = async () => (blobClient ??= await import('@vercel/blob'));
export const useBlobClient = (client) => (blobClient = client); // for tests

const hid = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 40);
const bpath = { email: (e) => `md/email/${hid(e)}.json`, user: (id) => `md/user/${id}.json`, sess: (h) => `md/sess/${h}.json`, push: (ep) => `md/push/${hid(ep)}.json`, sent: (k) => `md/sent/${hid(k)}.json` };

async function bread(pathname) {
  const r = await (await sdk()).get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode === 404 || !r.stream) return null;
  return new Response(r.stream).json();
}
const bwrite = async (pathname, value, { overwrite = true } = {}) =>
  (await sdk()).put(pathname, JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: overwrite, contentType: 'application/json' });
const bdel = async (...pathnames) => pathnames.length && (await sdk()).del(pathnames);
async function blist(prefix) {
  const out = [];
  let cursor;
  do {
    const page = await (await sdk()).list({ prefix, cursor });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

const blobBackend = {
  async findUserById(id) {
    return bread(bpath.user(id));
  },
  async findUserByEmail(email) {
    const ref = await bread(bpath.email(email));
    return ref ? blobBackend.findUserById(ref.id) : null;
  },
  async usersWithFollows() {
    const users = await Promise.all((await blist('md/user/')).map((b) => bread(b.pathname)));
    return users.filter((u) => u && u.follows.length > 0);
  },
  async createUser({ email, pwHash }) {
    const id = crypto.randomUUID();
    try {
      await bwrite(bpath.email(email), { id }, { overwrite: false }); // fails if the email is taken
    } catch (err) {
      if (/already exists/i.test(err.message)) return null;
      throw err;
    }
    const user = { id, email, pwHash, follows: [], settings: {}, failCount: 0, lockedUntil: 0, createdAt: Date.now() };
    await bwrite(bpath.user(id), user);
    return user;
  },
  async updateUser(id, patch) {
    const u = await blobBackend.findUserById(id);
    if (!u) return null;
    Object.assign(u, patch);
    await bwrite(bpath.user(id), u);
    return u;
  },
  async addSession(tokenHash, userId, expires) {
    await bwrite(bpath.sess(tokenHash), { userId, expires });
  },
  async userForSession(tokenHash) {
    const s = await bread(bpath.sess(tokenHash));
    return s && s.expires > Date.now() ? blobBackend.findUserById(s.userId) : null;
  },
  async removeSession(tokenHash) {
    await bdel(bpath.sess(tokenHash));
  },
  async upsertPush(endpoint, userId, sub) {
    await bwrite(bpath.push(endpoint), { endpoint, userId, sub });
  },
  async removePush(endpoint, userId) {
    const rec = await bread(bpath.push(endpoint));
    if (rec && (userId == null || rec.userId === userId)) await bdel(bpath.push(endpoint));
  },
  async pushForUser(userId) {
    const recs = await Promise.all((await blist('md/push/')).map((b) => bread(b.pathname)));
    return recs.filter((r) => r && r.userId === userId);
  },
  async sentAmong(keys) {
    const recs = await Promise.all(keys.map((k) => bread(bpath.sent(k))));
    return new Set(keys.filter((_, i) => recs[i]));
  },
  async markSent(keys, at) {
    await Promise.all(keys.map((k) => bwrite(bpath.sent(k), { at })));
  },
  async pruneSent(before) {
    const old = (await blist('md/sent/')).filter((b) => new Date(b.uploadedAt).getTime() < before);
    await bdel(...old.map((b) => b.pathname));
  },
};

const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN;
const backend = () => (redisUrl() && redisToken() ? redisBackend : blobToken() ? blobBackend : fileBackend);
export const storeKind = () => (backend() === redisBackend ? 'redis' : backend() === blobBackend ? 'blob' : 'file');

export const findUserByEmail = async (...a) => backend().findUserByEmail(...a);
export const findUserById = async (...a) => backend().findUserById(...a);
export const usersWithFollows = async (...a) => backend().usersWithFollows(...a);
export const createUser = async (...a) => backend().createUser(...a);
export const updateUser = async (...a) => backend().updateUser(...a);
export const addSession = async (...a) => backend().addSession(...a);
export const userForSession = async (...a) => backend().userForSession(...a);
export const removeSession = async (...a) => backend().removeSession(...a);
export const upsertPush = async (...a) => backend().upsertPush(...a);
export const removePush = async (...a) => backend().removePush(...a);
export const pushForUser = async (...a) => backend().pushForUser(...a);
export const sentAmong = async (...a) => backend().sentAmong(...a);
export const markSent = async (...a) => backend().markSent(...a);
export const pruneSent = async (...a) => backend().pruneSent(...a);
