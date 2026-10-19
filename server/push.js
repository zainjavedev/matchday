import webpush from 'web-push';
import { pushForUser, removePush } from './store.js';

let ready;
const configure = () => {
  if (ready !== undefined) return ready;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT } = process.env;
  ready = Boolean(pub && priv);
  if (ready) webpush.setVapidDetails(VAPID_SUBJECT ?? 'mailto:admin@example.com', pub, priv);
  return ready;
};

export const pushEnabled = () => configure();

// Returns how many devices got it. Dead subscriptions (404/410) are removed.
export async function pushToUser(userId, payload) {
  if (!configure()) return 0;
  let delivered = 0;
  for (const r of pushForUser(userId)) {
    try {
      await webpush.sendNotification(r.sub, JSON.stringify(payload));
      delivered++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) removePush(r.endpoint);
      else console.error('push failed', err.statusCode ?? err.message);
    }
  }
  return delivered;
}
