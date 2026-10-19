import { storage } from './storage.js';
import { F1_TEAM, SPORTS } from './sports.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';

const PATHS = { nba: 'basketball/nba', nfl: 'football/nfl', mlb: 'baseball/mlb', nhl: 'hockey/nhl' };

// Competitions a club plays in besides its domestic league. Unknown slugs 404 and are ignored.
const EUROPE = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'];
const CUPS = {
  'eng.1': ['eng.league_cup'],
  'esp.1': ['esp.copa_del_rey'],
  'ita.1': ['ita.coppa_italia'],
  'ger.1': ['ger.dfb_pokal'],
  'fra.1': ['fra.coupe_de_france'],
  'por.1': ['por.taca.portugal'],
  'ned.1': ['ned.cup'],
  'usa.1': ['usa.open', 'concacaf.champions'],
};

const TTL = 30 * 60 * 1000;
const CRICKET_TTL = 3 * 60 * 60 * 1000;
const CRICKET_DAYS = 21;

// ---------- cache: fresh → return it; fetch fails → fall back to stale ----------
async function cached(key, ttl, fn) {
  const k = `md.cache.${key}`;
  const hit = storage.read(k, null);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  try {
    const data = await fn();
    storage.write(k, { t: Date.now(), data });
    return data;
  } catch (err) {
    if (hit) return hit.data;
    throw err;
  }
}

const getJson = async (url, { allow404 = false } = {}) => {
  const res = await fetch(url);
  if (res.status === 404 && allow404) return null;
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    }),
  );
  return out;
}

// ---------- normalising ESPN events ----------
const logoOf = (team) => team?.logo || team?.logos?.find((l) => l.rel?.includes('default'))?.href || team?.logos?.[0]?.href || null;

const scoreOf = (c) => {
  const s = c?.score;
  if (s == null || s === '') return null;
  return typeof s === 'object' ? (s.displayValue ?? String(s.value ?? '')) : String(s);
};

function normEspn(e, sport, leagueName) {
  const comp = e.competitions?.[0];
  if (!comp) return null;
  const competitors = comp.competitors ?? [];
  const side = (c) => ({
    id: `${sport}:${c.team?.id ?? c.id}`,
    name: c.team?.displayName ?? c.team?.name ?? 'TBD',
    short: c.team?.shortDisplayName ?? c.team?.abbreviation ?? c.team?.displayName ?? 'TBD',
    logo: logoOf(c.team),
    color: c.team?.color ? `#${String(c.team.color).replace('#', '')}` : null,
    score: scoreOf(c),
    home: c.homeAway === 'home',
  });
  const sides = competitors.map(side);

  const start = Date.parse(e.date || comp.date);
  if (Number.isNaN(start)) return null;
  const endRaw = e.endDate || comp.endDate;
  let end = endRaw ? Date.parse(endRaw) : NaN;
  if (Number.isNaN(end) || end <= start) end = start + SPORTS[sport].duration * 60000;

  const status = comp.status?.type ?? e.status?.type ?? {};
  return {
    id: `${sport}:${e.id}`,
    sport,
    league: leagueName || e.league?.name || '',
    kind: 'match',
    start,
    end,
    timeValid: (comp.timeValid ?? e.timeValid) !== false && !sides.some((s) => s.name === 'TBA' || s.name === 'TBC'),
    state: status.state ?? 'pre',
    detail: status.state === 'in' || status.state === 'post' ? status.shortDetail || status.detail || '' : '',
    note: e.week?.text || comp.shortDescription || comp.description || e.description || '',
    cls: comp.class?.generalClassCard || comp.class?.eventType || '',
    venue: [comp.venue?.fullName, comp.venue?.address?.city].filter(Boolean).join(', '),
    sides,
  };
}

const withFollows = (events, followSet) =>
  events
    .map((e) => ({ ...e, followIds: e.sides.map((s) => s.id).filter((id) => followSet.has(id)) }))
    .filter((e) => e.followIds.length);

// ---------- team schedules (NBA / NFL / MLB / NHL / soccer) ----------
async function fetchTeamSchedule(team) {
  const id = team.espnId;
  if (team.sport === 'soccer') {
    const slugs = [team.leagueCode, ...EUROPE, ...(CUPS[team.leagueCode] ?? [])].filter(Boolean);
    const lists = await Promise.all(
      slugs.map(async (slug) => {
        try {
          const j = await getJson(`${ESPN}/soccer/${slug}/teams/${id}/schedule?fixture=true`, { allow404: true });
          return (j?.events ?? []).map((e) => ({ ...e, __league: e.league?.name || slug }));
        } catch {
          return [];
        }
      }),
    );
    return lists.flat();
  }
  const j = await getJson(`${ESPN}/${PATHS[team.sport]}/teams/${id}/schedule`);
  return (j?.events ?? []).map((e) => ({ ...e, __league: SPORTS[team.sport].label }));
}

async function loadTeamEvents(team, followSet) {
  const events = await cached(`team.${team.id}`, TTL, async () => {
    const raw = await fetchTeamSchedule(team);
    return raw.map((e) => normEspn(e, team.sport, e.__league)).filter(Boolean);
  });
  return withFollows(events, followSet);
}

// ---------- cricket: one shared date crawl for every followed cricket team ----------
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');

async function loadCricketEvents(followSet) {
  const today = Date.now();
  const days = Array.from({ length: CRICKET_DAYS }, (_, i) => ymd(today + (i - 1) * 86400000));
  const perDay = await pool(days, 6, async (day) => {
    try {
      return await cached(`cricket.${day}`, CRICKET_TTL, async () => {
        const j = await getJson(`${ESPN}/cricket/scorepanel?dates=${day}`);
        return (j.scores ?? [])
          .flatMap((sc) => (sc.events ?? []).map((e) => normEspn(e, 'cricket', sc.leagues?.[0]?.name || '')))
          .filter(Boolean);
      });
    } catch {
      return [];
    }
  });
  return withFollows(perDay.flat(), followSet);
}

// ---------- Formula 1 via Jolpica (the Ergast successor) ----------
const F1_SESSIONS = [
  ['FirstPractice', 'Practice 1', 60, true],
  ['SecondPractice', 'Practice 2', 60, true],
  ['ThirdPractice', 'Practice 3', 60, true],
  ['SprintQualifying', 'Sprint Qualifying', 45, false],
  ['SprintShootout', 'Sprint Qualifying', 45, false],
  ['Sprint', 'Sprint', 40, false],
  ['Qualifying', 'Qualifying', 60, false],
];

function f1Events(races) {
  const out = [];
  for (const race of races) {
    const base = {
      sport: 'f1',
      league: 'Formula 1',
      kind: 'session',
      sides: [],
      followIds: [F1_TEAM.id],
      venue: [race.Circuit?.circuitName, race.Circuit?.Location?.locality, race.Circuit?.Location?.country].filter(Boolean).join(', '),
      round: Number(race.round),
      raceName: race.raceName,
    };
    const push = (key, label, minutes, practice, date, time) => {
      if (!date) return;
      const start = Date.parse(`${date}T${time || '00:00:00Z'}`);
      if (Number.isNaN(start)) return;
      out.push({
        ...base,
        id: `f1:${race.season}:${race.round}:${key}`,
        session: label,
        practice,
        start,
        end: start + minutes * 60000,
        timeValid: Boolean(time),
        state: 'pre',
        note: `Round ${race.round}`,
      });
    };
    for (const [key, label, mins, practice] of F1_SESSIONS) {
      const s = race[key];
      if (s) push(key, label, mins, practice, s.date, s.time);
    }
    push('Race', 'Race', 120, false, race.date, race.time);
  }
  return out;
}

async function loadF1Events() {
  const year = new Date().getUTCFullYear();
  const season = async (y) =>
    cached(`f1.${y}`, 6 * 60 * 60 * 1000, async () => {
      const j = await getJson(`${JOLPICA}/${y}.json?limit=40`);
      return j.MRData?.RaceTable?.Races ?? [];
    });
  let races = await season(year);
  const lastStart = Math.max(0, ...f1Events(races).map((e) => e.end));
  if (!races.length || lastStart < Date.now()) {
    try {
      races = races.concat(await season(year + 1));
    } catch {}
  }
  return f1Events(races);
}

// ---------- public entry point ----------
export async function loadEvents(follows, teamsById) {
  const followSet = new Set(follows);
  const errors = [];
  const jobs = [];

  const teams = follows.map((id) => teamsById.get(id)).filter(Boolean);
  const espnTeams = teams.filter((t) => PATHS[t.sport] || t.sport === 'soccer');
  jobs.push(
    pool(espnTeams, 5, async (t) => {
      try {
        return await loadTeamEvents(t, followSet);
      } catch (err) {
        errors.push(t.name);
        return [];
      }
    }).then((r) => r.flat()),
  );
  if (teams.some((t) => t.sport === 'cricket')) {
    jobs.push(loadCricketEvents(followSet).catch(() => (errors.push('Cricket'), [])));
  }
  if (followSet.has(F1_TEAM.id)) {
    jobs.push(loadF1Events().catch(() => (errors.push('Formula 1'), [])));
  }

  const all = (await Promise.all(jobs)).flat();

  // The Lakers and the Warriors share a game: keep one copy, remember both follows.
  const byId = new Map();
  for (const e of all) {
    const prev = byId.get(e.id);
    if (!prev) byId.set(e.id, e);
    else prev.followIds = [...new Set([...prev.followIds, ...e.followIds])];
  }
  return { events: [...byId.values()].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)), errors };
}

// Exposed for tests.
export const _internal = { normEspn, f1Events };
