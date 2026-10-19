import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, dayLabel, timeLabel, zoneName, relative, countdownParts } from '../src/lib/time.js';
import { _internal } from '../src/lib/sources.js';

const PSG_BARCA = Date.parse('2026-10-20T19:00:00Z');
const PK = { tz: 'Asia/Karachi', clock: 'auto' };
const NY = { tz: 'America/New_York', clock: 'auto' };

test('same instant renders in each viewer\'s own timezone', () => {
  assert.match(timeLabel(PSG_BARCA, { ...PK, clock: '12' }), /^12:00\s?AM$/i);
  assert.match(timeLabel(PSG_BARCA, { ...NY, clock: '12' }), /^3:00\s?PM$/i);
  assert.equal(timeLabel(PSG_BARCA, { ...PK, clock: '24' }), '00:00');
  assert.equal(zoneName(PSG_BARCA, PK), 'GMT+5');
  assert.match(zoneName(PSG_BARCA, NY), /^(EDT|GMT-4)$/);
});

test('a game crossing midnight lands on a different day for different viewers', () => {
  assert.equal(dayKey(PSG_BARCA, PK), '2026-10-21');
  assert.equal(dayKey(PSG_BARCA, NY), '2026-10-20');
  const now = Date.parse('2026-10-19T12:00:00Z');
  assert.equal(dayLabel('2026-10-19', now, PK), 'Today');
  assert.equal(dayLabel('2026-10-20', now, PK), 'Tomorrow');
});

test('relative + countdown', () => {
  const now = 1_000_000_000_000;
  assert.equal(relative(now + 90 * 60000, now), 'in 1h 30m');
  assert.equal(relative(now + 26 * 3600000, now), 'in 1d 2h');
  assert.equal(relative(now - 1, now), 'now');
  assert.deepEqual(countdownParts(((1 * 24 + 2) * 3600 + 3 * 60 + 4) * 1000), { d: 1, h: 2, m: 3, s: 4 });
});

const espnEvent = (over = {}) => ({
  id: '99',
  date: '2026-10-22T02:00Z',
  competitions: [
    {
      timeValid: true,
      status: { type: { state: 'pre' } },
      venue: { fullName: 'Arena', address: { city: 'LA' } },
      competitors: [
        { homeAway: 'home', team: { id: '13', displayName: 'Los Angeles Lakers', shortDisplayName: 'Lakers', logos: [{ href: 'l.png', rel: ['default'] }] } },
        { homeAway: 'away', team: { id: '9', displayName: 'Golden State Warriors', shortDisplayName: 'Warriors', logos: [] } },
      ],
    },
  ],
  ...over,
});

test('normalises an ESPN event', () => {
  const e = _internal.normEspn(espnEvent(), 'nba', 'NBA');
  assert.equal(e.id, 'nba:99');
  assert.deepEqual(e.sides.map((s) => s.id), ['nba:13', 'nba:9']);
  assert.equal(e.start, Date.parse('2026-10-22T02:00Z'));
  assert.equal(e.timeValid, true);
  assert.equal(e.end - e.start, 150 * 60000);
});

test('TBD opponent or invalid time is flagged so no alarm is set', () => {
  const tbd = espnEvent();
  tbd.competitions[0].timeValid = false;
  assert.equal(_internal.normEspn(tbd, 'nba', 'NBA').timeValid, false);
  const tba = espnEvent();
  tba.competitions[0].competitors[1].team.displayName = 'TBA';
  assert.equal(_internal.normEspn(tba, 'nba', 'NBA').timeValid, false);
});

test('multi-day cricket stays live until its end date', () => {
  const e = _internal.normEspn(espnEvent({ date: '2026-10-18T23:30Z', endDate: '2026-10-22T23:59Z' }), 'cricket', 'Sheffield Shield');
  assert.equal(e.end, Date.parse('2026-10-22T23:59Z'));
});

test('F1 weekend expands to sessions, sprint included, in UTC', () => {
  const evs = _internal.f1Events([
    {
      season: '2026', round: '19', raceName: 'United States Grand Prix', date: '2026-10-25', time: '20:00:00Z',
      Circuit: { circuitName: 'COTA', Location: { locality: 'Austin', country: 'USA' } },
      FirstPractice: { date: '2026-10-23', time: '17:30:00Z' },
      SprintQualifying: { date: '2026-10-23', time: '21:30:00Z' },
      Sprint: { date: '2026-10-24', time: '17:00:00Z' },
      Qualifying: { date: '2026-10-24', time: '21:00:00Z' },
    },
  ]);
  assert.deepEqual(evs.map((e) => e.session), ['Practice 1', 'Sprint Qualifying', 'Sprint', 'Qualifying', 'Race']);
  assert.equal(evs.find((e) => e.session === 'Race').start, Date.parse('2026-10-25T20:00:00Z'));
  assert.equal(evs[0].practice, true);
  assert.ok(evs.slice(1).every((e) => !e.practice));
});
