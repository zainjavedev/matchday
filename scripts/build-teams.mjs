// Builds public/teams.json: every followable team with a logo.
// ESPN's /teams endpoints send no CORS headers, so we bake the list at build time.
// Cricket has no teams endpoint, so we crawl the scorepanel across a year of dates.
import { writeFile } from 'node:fs/promises';

const API = 'https://site.api.espn.com/apis/site/v2/sports';

const LEAGUES = [
  { sport: 'nba', path: 'basketball/nba', name: 'NBA' },
  { sport: 'nfl', path: 'football/nfl', name: 'NFL' },
  { sport: 'mlb', path: 'baseball/mlb', name: 'MLB' },
  { sport: 'nhl', path: 'hockey/nhl', name: 'NHL' },
  { sport: 'soccer', path: 'soccer/eng.1', name: 'Premier League', code: 'eng.1' },
  { sport: 'soccer', path: 'soccer/esp.1', name: 'La Liga', code: 'esp.1' },
  { sport: 'soccer', path: 'soccer/ita.1', name: 'Serie A', code: 'ita.1' },
  { sport: 'soccer', path: 'soccer/ger.1', name: 'Bundesliga', code: 'ger.1' },
  { sport: 'soccer', path: 'soccer/fra.1', name: 'Ligue 1', code: 'fra.1' },
  { sport: 'soccer', path: 'soccer/por.1', name: 'Primeira Liga', code: 'por.1' },
  { sport: 'soccer', path: 'soccer/ned.1', name: 'Eredivisie', code: 'ned.1' },
  { sport: 'soccer', path: 'soccer/usa.1', name: 'MLS', code: 'usa.1' },
  { sport: 'soccer', path: 'soccer/tur.1', name: 'Süper Lig', code: 'tur.1' },
];

const get = async (url) => {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch {}
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return null;
};

const teams = [];
const seen = new Set();
const add = (t) => {
  const key = `${t.sport}:${t.espnId}`;
  if (seen.has(key)) return;
  seen.add(key);
  teams.push({ id: key, ...t });
};

for (const lg of LEAGUES) {
  const j = await get(`${API}/${lg.path}/teams?limit=100`);
  const list = j?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  for (const { team } of list) {
    add({
      sport: lg.sport,
      league: lg.name,
      leagueCode: lg.code ?? null,
      espnId: team.id,
      name: team.displayName,
      short: team.shortDisplayName ?? team.displayName,
      abbr: team.abbreviation ?? '',
      logo: team.logos?.[0]?.href ?? null,
      color: team.color ? `#${team.color}` : null,
    });
  }
  console.log(lg.name.padEnd(18), list.length);
}

// ---- Cricket: crawl the scorepanel day by day and keep teams we care about.
const INTERNATIONAL = [
  'Pakistan', 'India', 'Australia', 'England', 'South Africa', 'New Zealand', 'West Indies',
  'Sri Lanka', 'Bangladesh', 'Afghanistan', 'Zimbabwe', 'Ireland', 'Netherlands', 'Scotland',
  'United Arab Emirates', 'Nepal', 'Oman', 'USA', 'Namibia',
];
const FRANCHISE_LEAGUES = /Indian Premier League|Pakistan Super League|Big Bash League|SA20|The Hundred|Caribbean Premier League|International League T20|Bangladesh Premier League|Lanka Premier League|Major League Cricket|Super Smash/i;

const start = new Date(Date.UTC(2026, 2, 1));
const days = [];
for (let i = 0; i < 365; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  days.push(d.toISOString().slice(0, 10).replaceAll('-', ''));
}
const cricket = new Map();
let cursor = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (cursor < days.length) {
      const day = days[cursor++];
      const j = await get(`${API}/cricket/scorepanel?dates=${day}`);
      for (const sc of j?.scores ?? []) {
        const leagueName = sc.leagues?.[0]?.name ?? '';
        for (const ev of sc.events ?? []) {
          for (const c of ev.competitions?.[0]?.competitors ?? []) {
            const t = c.team;
            if (!t || t.displayName === 'TBA' || t.displayName === 'TBC') continue;
            const women = /Women|\bW\b/.test(t.displayName);
            const isIntl = INTERNATIONAL.includes(t.displayName) || INTERNATIONAL.some((n) => t.displayName === `${n} Women`);
            const isFranchise = FRANCHISE_LEAGUES.test(leagueName) && !/Under-19|\bA\b$/.test(t.displayName);
            if (!isIntl && !isFranchise) continue;
            if (!cricket.has(t.id)) {
              cricket.set(t.id, {
                espnId: t.id,
                name: t.displayName,
                short: t.shortDisplayName ?? t.displayName,
                abbr: t.abbreviation ?? '',
                logo: t.logo || `https://a.espncdn.com/i/teamlogos/cricket/500/${t.id}.png`,
                color: t.color || null,
                league: isIntl ? (women ? 'International · Women' : 'International') : leagueName,
              });
            }
          }
        }
      }
    }
  }),
);
for (const t of cricket.values()) add({ sport: 'cricket', leagueCode: null, ...t });
console.log('Cricket'.padEnd(18), cricket.size);

teams.sort((a, b) => a.sport.localeCompare(b.sport) || a.league.localeCompare(b.league) || a.name.localeCompare(b.name));
await writeFile(new URL('../public/teams.json', import.meta.url), JSON.stringify(teams));
console.log('Total', teams.length);
