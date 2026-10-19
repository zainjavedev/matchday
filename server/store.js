// A tiny JSON-file database: one file, loaded into memory, rewritten atomically on every change.
// Fine for a personal app on ONE always-on server (VPS / Docker with a volume). It does NOT persist
// on serverless hosts like Vercel, where the filesystem is read-only/ephemeral.
import fs from 'node:fs';
import path from 'node:path';

// Serverless hosts can't keep this file. Fail loudly instead of losing accounts on the next cold start.
const assertPersistentHost = () => {
  if (process.env.VERCEL && !process.env.DATA_FILE) {
    throw new Error('This app stores data in a local file, which Vercel cannot keep. Host it on a server with a persistent disk (see README).');
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
export const findUserByEmail = (email) => state().users.find((u) => u.email === email) ?? null;
export const findUserById = (id) => state().users.find((u) => u.id === id) ?? null;
export const usersWithFollows = () => state().users.filter((u) => u.follows.length > 0);

export function createUser({ email, pwHash }) {
  const s = state();
  if (findUserByEmail(email)) return null;
  const user = { id: s.nextId++, email, pwHash, follows: [], settings: {}, failCount: 0, lockedUntil: 0, createdAt: Date.now() };
  s.users.push(user);
  save();
  return user;
}

export function updateUser(id, patch) {
  const u = findUserById(id);
  if (!u) return null;
  Object.assign(u, patch);
  save();
  return u;
}

// ---- sessions
export function addSession(tokenHash, userId, expires) {
  const s = state();
  s.sessions = s.sessions.filter((x) => x.expires > Date.now()); // sweep expired ones as we go
  s.sessions.push({ tokenHash, userId, expires });
  save();
}

export function userForSession(tokenHash) {
  const s = state().sessions.find((x) => x.tokenHash === tokenHash && x.expires > Date.now());
  return s ? findUserById(s.userId) : null;
}

export function removeSession(tokenHash) {
  const s = state();
  s.sessions = s.sessions.filter((x) => x.tokenHash !== tokenHash);
  save();
}

// ---- push subscriptions
export function upsertPush(endpoint, userId, sub) {
  const s = state();
  s.pushSubs = s.pushSubs.filter((p) => p.endpoint !== endpoint);
  s.pushSubs.push({ endpoint, userId, sub });
  save();
}

export function removePush(endpoint, userId) {
  const s = state();
  s.pushSubs = s.pushSubs.filter((p) => !(p.endpoint === endpoint && (userId == null || p.userId === userId)));
  save();
}

export const pushForUser = (userId) => state().pushSubs.filter((p) => p.userId === userId);

// ---- reminders already delivered
export const sentAmong = (keys) => new Set(keys.filter((k) => k in state().sent));

export function markSent(keys, at) {
  for (const k of keys) state().sent[k] = at;
  save();
}

export function pruneSent(before) {
  const s = state();
  for (const k of Object.keys(s.sent)) if (s.sent[k] < before) delete s.sent[k];
  save();
}
