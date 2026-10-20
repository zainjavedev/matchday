import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { F1_TEAM, SPORTS, SPORT_ORDER } from './lib/sports.js';
import { loadEvents } from './lib/sources.js';
import { DEFAULT_SETTINGS, useLocal } from './lib/store.js';
import { dayKey, dayLabel, timeLabel, zoneCity } from './lib/time.js';
import { readShared } from './lib/share.js';
import { EventCard, Hero, isLive } from './components/Event.jsx';
import { Picker } from './components/Picker.jsx';
import { Settings } from './components/Settings.jsx';
import { Icon, Logo } from './components/ui.jsx';

const RANGES = [['week', 'This week', 7], ['month', '30 days', 30], ['all', 'Everything', 3650]];
const DAY = 86400000;

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export default function App() {
  const [teams, setTeams] = useState([]);
  // No accounts: the lineup and settings live in this browser's localStorage.
  const [follows, setFollows] = useLocal('md.follows', []);
  const [stored, setSettings] = useLocal('md.settings', {});
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState({ loading: false, errors: [] });
  const [sportFilter, setSportFilter] = useState('all');
  const [range, setRange] = useLocal('md.range', 'month');
  const [sheet, setSheet] = useState(null); // {type:'picker'|'settings', tab?}
  const [toastMsg, setToastMsg] = useState(null);
  const [shared, setShared] = useState(() => readShared());
  const now = useNow(30000);
  const toastTimer = useRef();

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3600);
  }, []);

  useEffect(() => {
    fetch('/teams.json').then((r) => r.json()).then((t) => setTeams([F1_TEAM, ...t])).catch(() => toast('Could not load the team list.'));
  }, [toast]);
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  // Theme (cached in localStorage so the page doesn't flash the wrong one before the account loads)
  useEffect(() => {
    const el = document.documentElement;
    if (settings.theme === 'auto') delete el.dataset.theme;
    else el.dataset.theme = settings.theme;
    try {
      localStorage.setItem('md.theme', settings.theme);
    } catch {}
  }, [settings.theme]);

  // Load schedules whenever the lineup changes, and refresh when the tab becomes visible again.
  const reqId = useRef(0);
  const refresh = useCallback(async () => {
    if (!follows.length || !teamsById.size) {
      setEvents([]);
      return;
    }
    const id = ++reqId.current;
    setStatus((s) => ({ ...s, loading: true }));
    const { events: evs, errors } = await loadEvents(follows, teamsById);
    if (id !== reqId.current) return;
    setEvents(evs);
    setStatus({ loading: false, errors });
  }, [follows, teamsById]);

  useEffect(() => {
    refresh();
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(refresh, 15 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(t);
    };
  }, [refresh]);

  const visible = useMemo(
    () => events.filter((e) => e.end > now && e.state !== 'post' && (settings.showPractice || !e.practice) && (sportFilter === 'all' || e.sport === sportFilter)),
    [events, now, settings.showPractice, sportFilter],
  );

  const rangeDays = RANGES.find((r) => r[0] === range)[2];
  const live = visible.filter((e) => isLive(e, now));
  const upcoming = visible.filter((e) => !isLive(e, now) && (e.start - now < rangeDays * DAY || !e.timeValid));
  const later = visible.length - live.length - upcoming.length;
  const next = upcoming.find((e) => e.timeValid);

  const groups = useMemo(() => {
    const map = new Map();
    for (const e of upcoming) {
      const k = dayKey(e.start, settings);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
    return [...map.entries()];
  }, [upcoming, settings]);

  const followedSports = useMemo(() => SPORT_ORDER.filter((s) => follows.some((f) => f.startsWith(`${s}:`))), [follows]);
  useEffect(() => {
    if (sportFilter !== 'all' && !followedSports.includes(sportFilter)) setSportFilter('all');
  }, [followedSports, sportFilter]);

  const toggleFollow = (id) =>
    setFollows((f) => {
      const on = f.includes(id);
      if (!on) navigator.vibrate?.(8);
      return on ? f.filter((x) => x !== id) : [...f, id];
    });

  const empty = follows.length === 0;
  const sharedNew = shared.filter((id) => teamsById.has(id) && !follows.includes(id));

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="/" aria-label="Matchday home">
          <img src="/icon.svg" width="30" height="30" alt="" /> <span>matchday</span>
        </a>
        <button className="tz-chip" onClick={() => setSheet({ type: 'settings' })} title="Change timezone">
          <Icon name="pin" size={14} /> {zoneCity(settings)} · {timeLabel(now, settings)}
        </button>
        <div className="top-actions">
          <button className="btn primary desk" onClick={() => setSheet({ type: 'picker' })}><Icon name="plus" size={18} /> Teams{follows.length ? ` · ${follows.length}` : ''}</button>
          <button className="icon-btn" onClick={() => setSheet({ type: 'settings' })} aria-label="Settings & alerts"><Icon name="gear" /></button>
        </div>
      </header>

      <main>
        {sharedNew.length > 0 && (
          <div className="banner">
            <span>Someone shared {sharedNew.length} team{sharedNew.length > 1 ? 's' : ''} with you.</span>
            <button className="btn small primary" onClick={() => { setFollows((f) => [...new Set([...f, ...sharedNew])]); setShared([]); history.replaceState(null, '', location.pathname); }}>Add them</button>
            <button className="link" onClick={() => { setShared([]); history.replaceState(null, '', location.pathname); }}>No thanks</button>
          </div>
        )}

        {empty ? (
          <Welcome teams={teamsById} onPick={(tab) => setSheet({ type: 'picker', tab })} />
        ) : (
          <>
            {next && <Hero key={next.id} e={next} settings={settings} />}

            <div className="toolbar">
              <div className="chips" role="tablist" aria-label="Filter by sport">
                <button className={`pill ${sportFilter === 'all' ? 'on' : ''}`} onClick={() => setSportFilter('all')}>All</button>
                {followedSports.map((s) => (
                  <button key={s} className={`pill ${sportFilter === s ? 'on' : ''}`} onClick={() => setSportFilter(s)}>{SPORTS[s].emoji} {SPORTS[s].label}</button>
                ))}
              </div>
              <div className="seg small" aria-label="Time range">
                {RANGES.map(([k, l]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}
              </div>
            </div>

            {status.errors.length > 0 && <p className="notice">Couldn’t refresh {status.errors.slice(0, 3).join(', ')}{status.errors.length > 3 ? '…' : ''} — showing the last saved schedule.</p>}

            {live.length > 0 && (
              <section className="day">
                <h2 className="day-head live-head"><i /> Happening now</h2>
                {live.map((e, i) => <EventCard key={e.id} e={e} now={now} settings={settings} index={i} />)}
              </section>
            )}

            {groups.map(([k, list]) => (
              <section className="day" key={k}>
                <h2 className="day-head">{dayLabel(k, now, settings)} <small>{list.length} {list.length === 1 ? 'game' : 'games'}</small></h2>
                {list.map((e, i) => <EventCard key={e.id} e={e} now={now} settings={settings} index={i} />)}
              </section>
            ))}

            {status.loading && !visible.length && <Skeletons />}
            {!status.loading && !live.length && !groups.length && (
              <div className="quiet">
                <p className="big">All quiet.</p>
                <p className="muted">No games in this window{later ? ` — but ${later} more later on` : ''}.</p>
                {later > 0 && <button className="btn" onClick={() => setRange('all')}>Show everything</button>}
              </div>
            )}
            {later > 0 && groups.length > 0 && <button className="more" onClick={() => setRange(range === 'week' ? 'month' : 'all')}>{later} more further out · show</button>}
          </>
        )}
      </main>

      {!empty && <button className="fab" onClick={() => setSheet({ type: 'picker' })} aria-label="Add teams"><Icon name="plus" size={26} /></button>}

      {sheet?.type === 'picker' && <Picker teams={teams} follows={follows} onToggle={toggleFollow} startTab={sheet.tab} onClose={() => setSheet(null)} />}
      {sheet?.type === 'settings' && (
        <Settings settings={settings} setSettings={setSettings} follows={follows} toast={toast} onClose={() => setSheet(null)} onReset={() => setFollows([])} />
      )}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

const SHOWCASE = ['soccer:83', 'nba:13', 'f1:f1', 'cricket:7', 'nfl:12', 'soccer:86', 'nba:9', 'soccer:364'];

function Welcome({ teams, onPick }) {
  return (
    <section className="welcome">
      <div className="float-logos" aria-hidden="true">
        {SHOWCASE.map((id, i) => {
          const t = teams.get(id);
          return t ? <span key={id} style={{ '--k': i }}><Logo src={t.logo} name={t.short} color={t.color} size={56} /></span> : null;
        })}
      </div>
      <h1>Never miss <em>kickoff</em> again.</h1>
      <p className="lede">Pick the teams you love. Every game lands in one timeline, in your own timezone. No account needed.</p>
      <button className="btn primary big" onClick={() => onPick('soccer')}>Choose your teams</button>
      <div className="sport-tiles">
        {SPORT_ORDER.map((s, i) => (
          <button key={s} className="sport-tile" style={{ '--i': i, '--sport': SPORTS[s].color }} onClick={() => onPick(s)}>
            <span>{SPORTS[s].emoji}</span>{SPORTS[s].label}
          </button>
        ))}
      </div>
    </section>
  );
}

const Skeletons = () => (
  <div aria-busy="true" aria-label="Loading games">
    {[0, 1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ '--i': i }} />)}
  </div>
);
