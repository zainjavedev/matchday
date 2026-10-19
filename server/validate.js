const ID_RE = /^[a-z0-9]+:[\w.-]+$/i;
export const LEADS = [0, 10, 30, 60, 180, 1440];

export const cleanFollows = (v) => (Array.isArray(v) ? [...new Set(v.filter((f) => typeof f === 'string' && ID_RE.test(f)))].slice(0, 120) : []);

// Only known settings, only sane values.
export function cleanSettings(s = {}) {
  const out = {};
  if (typeof s.tz === 'string' && s.tz.length < 64) out.tz = s.tz;
  if (typeof s.tzDevice === 'string' && s.tzDevice.length < 64) out.tzDevice = s.tzDevice;
  if (['auto', '12', '24'].includes(s.clock)) out.clock = s.clock;
  if (['auto', 'dark', 'light'].includes(s.theme)) out.theme = s.theme;
  if (LEADS.includes(s.lead)) out.lead = s.lead;
  if (typeof s.email === 'boolean') out.email = s.email;
  if (typeof s.showPractice === 'boolean') out.showPractice = s.showPractice;
  return out;
}
