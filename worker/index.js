// Cloudflare Worker: email reminders for Matchday.
//   POST /subscribe   {email, follows[], lead}  -> sends a confirmation email
//   GET  /confirm     ?id&t                      -> activates the subscription
//   GET  /unsubscribe ?id&t                      -> deletes it
//   cron (every 10 min)                          -> sends due reminders
import { loadEvents } from '../src/lib/sources.js';
import { F1_TEAM } from '../src/lib/sports.js';
import { dueReminders, emailFor } from './reminders.js';

const LEADS = [0, 10, 30, 60, 180, 1440];
const ID_RE = /^[a-z0-9]+:[\w.-]+$/i;

const cors = (env) => ({
  'access-control-allow-origin': env.SITE_URL,
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
});
const json = (env, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(env), 'content-type': 'application/json' } });
const page = (msg) => new Response(`<!doctype html><meta name=viewport content="width=device-width"><body style="font:18px system-ui;max-width:420px;margin:20vh auto;padding:0 20px">${msg}</body>`, { headers: { 'content-type': 'text/html' } });

const token = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

async function sendEmail(env, to, subject, text) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, text }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

async function subscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(env, { error: 'bad json' }, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  const follows = Array.isArray(body.follows) ? [...new Set(body.follows.filter((f) => typeof f === 'string' && ID_RE.test(f)))].slice(0, 60) : [];
  const lead = LEADS.includes(body.lead) ? body.lead : 30;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200 || !follows.length) return json(env, { error: 'invalid' }, 400);

  // One subscription per address; re-subscribing replaces the lineup and asks for confirmation again.
  const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email))), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
  const sub = { id, email, follows, lead, confirmed: false, token: token(), created: Date.now() };
  await env.SUBS.put(`sub:${id}`, JSON.stringify(sub), { expirationTtl: 2 * 86400 }); // unconfirmed ones expire
  const url = `${new URL(request.url).origin}/confirm?id=${id}&t=${sub.token}`;
  await sendEmail(env, email, 'Confirm your Matchday reminders', `Tap to confirm:\n${url}\n\nIf this wasn't you, ignore this email.`);
  return json(env, { ok: true });
}

async function confirmOrUnsub(url, env, action) {
  const id = url.searchParams.get('id');
  const raw = id && (await env.SUBS.get(`sub:${id}`));
  const sub = raw && JSON.parse(raw);
  if (!sub || sub.token !== url.searchParams.get('t')) return page('This link is invalid or has expired.');
  if (action === 'unsubscribe') {
    await env.SUBS.delete(`sub:${id}`);
    return page('Unsubscribed. No more emails.');
  }
  sub.confirmed = true;
  await env.SUBS.put(`sub:${id}`, JSON.stringify(sub)); // no expiry once confirmed
  return page("You're in. We'll email you before your games.");
}

async function runCron(env) {
  const list = await env.SUBS.list({ prefix: 'sub:' });
  const subs = (await Promise.all(list.keys.map((k) => env.SUBS.get(k.name, 'json')))).filter((s) => s?.confirmed);
  if (!subs.length) return;

  const teams = await (await fetch(`${env.SITE_URL}/teams.json`)).json();
  const teamsById = new Map([F1_TEAM, ...teams].map((t) => [t.id, t]));
  const follows = [...new Set(subs.flatMap((s) => s.follows))];
  const { events } = await loadEvents(follows, teamsById);

  const now = Date.now();
  const candidates = dueReminders({ subs, events, sent: new Set(), now });
  const sent = new Set();
  for (const c of candidates) if (await env.SUBS.get(`sent:${c.key}`)) sent.add(c.key);
  const due = candidates.filter((c) => !sent.has(c.key));

  const bySub = new Map();
  for (const d of due) bySub.set(d.sub.id, [...(bySub.get(d.sub.id) ?? []), d]);
  const apiUrl = env.API_URL;
  for (const [, items] of bySub) {
    const { subject, text } = emailFor(items[0].sub, items, { siteUrl: env.SITE_URL, apiUrl });
    try {
      await sendEmail(env, items[0].sub.email, subject, text);
      await Promise.all(items.map((i) => env.SUBS.put(`sent:${i.key}`, '1', { expirationTtl: 7 * 86400 })));
    } catch (err) {
      console.error('email failed', items[0].sub.id, err.message); // retried on the next tick
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    if (url.pathname === '/subscribe' && request.method === 'POST') return subscribe(request, env);
    if (url.pathname === '/confirm') return confirmOrUnsub(url, env, 'confirm');
    if (url.pathname === '/unsubscribe') return confirmOrUnsub(url, env, 'unsubscribe');
    return json(env, { name: 'matchday-worker' }, 404);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};
