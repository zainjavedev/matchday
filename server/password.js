import crypto from 'node:crypto';

const scrypt = (pw, salt) =>
  new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt);
  return `s1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  const [version, salt, hash] = String(stored).split('$');
  if (version !== 's1' || !salt || !hash) return false;
  const key = await scrypt(pw, Buffer.from(salt, 'hex'));
  const want = Buffer.from(hash, 'hex');
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}

export const normEmail = (e) => String(e ?? '').trim().toLowerCase();
export const validEmail = (e) => e.length <= 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
export const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200;
