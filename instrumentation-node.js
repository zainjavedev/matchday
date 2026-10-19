import { runReminders } from './server/runReminders.js';

export function startScheduler() {
  const tick = () => runReminders().then((r) => r.due && console.log('[reminders]', r)).catch((e) => console.error('[reminders]', e));
  setTimeout(tick, 15000);
  setInterval(tick, 5 * 60 * 1000);
}
