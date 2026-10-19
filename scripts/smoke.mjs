// Live smoke test: node test/smoke.mjs   (hits the real APIs)
import { readFile } from 'node:fs/promises';
import { loadEvents } from '../src/lib/sources.js';
import { F1_TEAM } from '../src/lib/sports.js';

const teams = JSON.parse(await readFile(new URL('../public/teams.json', import.meta.url)));
const byId = new Map([...teams, F1_TEAM].map((t) => [t.id, t]));
const follows = ['soccer:83', 'nba:13', 'nba:9', 'f1:f1', 'cricket:7', 'nfl:12'];
const { events, errors } = await loadEvents(follows, byId);
console.log('errors', errors, 'events', events.length);
const now = Date.now();
const upcoming = events.filter((e) => e.end > now);
for (const e of upcoming.slice(0, 18)) {
  console.log(new Date(e.start).toISOString(), e.sport.padEnd(7), (e.session || e.sides.map((s) => s.short).join(' v ')).padEnd(32), e.league, '|', e.followIds.join(','), e.timeValid ? '' : 'TBD', e.state);
}
const sorted = events.every((e, i) => i === 0 || events[i - 1].start <= e.start);
const ids = new Set(events.map((e) => e.id));
console.log('sorted:', sorted, 'unique:', ids.size === events.length);
const shared = events.find((e) => e.followIds.includes('nba:13') && e.followIds.includes('nba:9'));
console.log('Lakers-Warriors shared game once with both follows:', shared && shared.followIds);
console.log('sports present:', [...new Set(upcoming.map((e) => e.sport))]);
