export const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const zoneOf = (settings) => (settings.tz && settings.tz !== 'auto' ? settings.tz : deviceZone());

export const allZones = () => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [deviceZone()];
  }
};

// hourCycle h23 avoids "24:00" at midnight, which hour12:false produces in some locales.
const clockOf = (settings) => (settings.clock === '12' ? { hour12: true } : settings.clock === '24' ? { hourCycle: 'h23' } : {});

const fmt = (ms, tz, opts) => new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts }).format(ms);

export const timeLabel = (ms, settings) =>
  fmt(ms, zoneOf(settings), { hour: 'numeric', minute: '2-digit', ...clockOf(settings) });

export const dateTimeLabel = (ms, settings) =>
  fmt(ms, zoneOf(settings), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    ...clockOf(settings),
  });

export const zoneName = (ms, settings) => {
  const tz = zoneOf(settings);
  const part = new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(ms)
    .find((p) => p.type === 'timeZoneName');
  return part ? part.value : tz;
};

export const zoneCity = (settings) => zoneOf(settings).split('/').pop().replaceAll('_', ' ');

// yyyy-mm-dd of the instant, as seen in the viewer's zone. en-CA gives ISO ordering.
export const dayKey = (ms, settings) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zoneOf(settings), year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

const dayNumber = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

export const dayLabel = (key, nowMs, settings) => {
  const diff = dayNumber(key) - dayNumber(dayKey(nowMs, settings));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const [y, m, d] = key.split('-').map(Number);
  const noon = Date.UTC(y, m - 1, d, 12);
  return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' }).format(noon);
};

export const countdownParts = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
};

export const relative = (ms, nowMs) => {
  const diff = ms - nowMs;
  const mins = Math.round(diff / 60000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h${mins % 60 ? ` ${mins % 60}m` : ''}`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d${hrs % 24 ? ` ${hrs % 24}h` : ''}`;
};
