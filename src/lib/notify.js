import { useCallback, useEffect, useRef } from 'react';
import { storage } from './storage.js';
import { SPORTS } from './sports.js';
import { titleOf } from './title.js';

export const canNotify = () => typeof Notification !== 'undefined';
export const permission = () => (canNotify() ? Notification.permission : 'unsupported');

export async function askPermission() {
  if (!canNotify()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export async function showNotification(title, body, tag) {
  if (permission() !== 'granted') return false;
  const opts = { body, tag, icon: '/icon.svg', badge: '/icon.svg' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, opts);
      return true;
    }
    new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}

// Which lead times apply to an event: the ones picked by hand, plus the default if auto-remind is on.
export const leadsFor = (event, manual, autoLead, auto) => {
  const set = new Set(manual[event.id] ?? []);
  if (auto && autoLead > 0) set.add(autoLead);
  return [...set];
};

const phrase = (mins) => {
  if (mins <= 0) return 'is starting now';
  if (mins < 60) return `starts in ${mins} min`;
  if (mins < 2880) return `starts in ${Math.round(mins / 60)}h`;
  return `starts in ${Math.round(mins / 1440)} days`;
};

const FIRED_KEY = 'md.fired';

export function useBrowserReminders(events, manual, settings) {
  const ref = useRef({ events, manual, settings });
  ref.current = { events, manual, settings };

  const tick = useCallback(() => {
    const { events, manual, settings } = ref.current;
    if (permission() !== 'granted') return;
    const now = Date.now();
    const fired = storage.read(FIRED_KEY, {});
    let dirty = false;
    for (const k of Object.keys(fired)) {
      if (now - fired[k] > 7 * 86400000) {
        delete fired[k];
        dirty = true;
      }
    }
    for (const e of events) {
      if (!e.timeValid || e.state !== 'pre' || e.start <= now) continue;
      for (const lead of leadsFor(e, manual, settings.lead, settings.autoBrowser)) {
        const key = `${e.id}|${lead}`;
        if (fired[key] || now < e.start - lead * 60000) continue;
        fired[key] = now;
        dirty = true;
        showNotification(`${SPORTS[e.sport].emoji} ${titleOf(e)}`, `${e.league} ${phrase(Math.max(0, Math.round((e.start - now) / 60000)))}`, key);
      }
    }
    if (dirty) storage.write(FIRED_KEY, fired);
  }, []);

  // Check as soon as the schedule or the reminder choices change, and then every 20s.
  useEffect(tick, [tick, events, manual, settings.lead, settings.autoBrowser]);
  useEffect(() => {
    const t = setInterval(tick, 20000);
    return () => clearInterval(t);
  }, [tick]);
}

// ---------- ntfy: free phone push. The ntfy server holds the message and delivers it later,
// so it still arrives when this tab is closed. Limit: it will only hold a message for 3 days. ----------
const NTFY = 'https://ntfy.sh';
const NTFY_KEY = 'md.ntfy';
const THREE_DAYS = 3 * 86400000;

export const ntfyUrl = (topic) => `${NTFY}/${topic}`;

export async function ntfySend(topic, message, title = 'Matchday') {
  const res = await fetch(NTFY, {
    method: 'POST',
    body: JSON.stringify({ topic, title, message, tags: ['tada'], click: location.origin }),
  });
  return res.ok;
}

export async function scheduleNtfy(events, manual, settings, onProgress) {
  const { ntfyTopic: topic } = settings;
  if (!topic) return { sent: 0, left: 0 };
  const now = Date.now();
  const done = storage.read(NTFY_KEY, {});
  for (const k of Object.keys(done)) if (done[k] < now - 86400000) delete done[k];

  const todo = [];
  for (const e of events) {
    if (!e.timeValid || e.state !== 'pre') continue;
    for (const lead of leadsFor(e, manual, settings.lead, settings.autoPhone)) {
      const at = e.start - lead * 60000;
      const key = `${e.id}|${lead}|${topic}`;
      if (done[key] || at < now + 15000 || at > now + THREE_DAYS - 60000) continue;
      todo.push({ e, lead, at, key });
    }
  }
  todo.sort((a, b) => a.at - b.at);

  let sent = 0;
  for (const { e, lead, at, key } of todo.slice(0, 40)) {
    try {
      const res = await fetch(NTFY, {
        method: 'POST',
        body: JSON.stringify({
          topic,
          title: `${SPORTS[e.sport].emoji} ${titleOf(e)}`,
          message: `${e.league} ${phrase(lead)}`,
          tags: [e.sport],
          delay: String(Math.floor(at / 1000)),
          click: location.origin,
        }),
      });
      if (res.status === 429) break;
      if (res.ok) {
        done[key] = e.start;
        sent++;
        onProgress?.(sent);
      }
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  storage.write(NTFY_KEY, done);
  return { sent, left: Math.max(0, todo.length - sent) };
}
