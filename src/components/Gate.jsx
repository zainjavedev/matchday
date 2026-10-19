import React, { useEffect, useMemo, useState } from 'react';
import { F1_TEAM } from '../lib/sports.js';
import { loadEvents } from '../lib/sources.js';
import { DEFAULT_SETTINGS } from '../lib/store.js';
import { dayKey, dayLabel } from '../lib/time.js';
import { EventCard, Hero } from './Event.jsx';

// Popular teams whose real schedules fill the preview, so a visitor sees what the product shows.
const PREVIEW_TEAMS = [
  ['soccer', 'Barcelona'], ['soccer', 'Real Madrid'], ['soccer', 'Liverpool'], ['soccer', 'Manchester City'],
  ['nba', 'Los Angeles Lakers'], ['nba', 'Golden State Warriors'], ['nba', 'Boston Celtics'], ['nba', 'New York Knicks'], ['cricket', 'India'],
  ['nfl', 'Kansas City Chiefs'],
];

async function loadPreview(teams) {
  const byId = new Map([F1_TEAM, ...teams].map((t) => [t.id, t]));
  const ids = [F1_TEAM.id, ...PREVIEW_TEAMS.map(([sport, name]) => teams.find((t) => t.sport === sport && t.name === name)?.id).filter(Boolean)];
  const { events } = await loadEvents(ids, byId);
  const now = Date.now();
  return events.filter((e) => e.end > now && e.state !== 'post' && e.timeValid && !e.practice && e.start < now + 4 * 86400000).slice(0, 10);
}

export function Gate({ onAuthed }) {
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState(null); // null = loading, [] = unavailable
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetch('/teams.json').then((r) => r.json()).then(loadPreview).then(setEvents).catch(() => setEvents([]));
  }, []);
  const groups = useMemo(() => {
    const map = new Map();
    for (const e of (events ?? []).slice(1)) {
      const k = dayKey(e.start, DEFAULT_SETTINGS);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [events]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, email, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Something went wrong.');
      else onAuthed(data.user);
    } catch {
      setError('Could not reach the server.');
    }
    setBusy(false);
  };

  const signup = mode === 'signup';
  return (
    <div className="landing">
      <aside className="auth-card">
        <div className="auth-brand"><img src="/icon.svg" width="30" height="30" alt="" /> <span>matchday</span></div>
        <h1>{signup ? 'Never miss a game.' : 'Welcome back.'}</h1>
        <p className="muted">{signup ? 'Pick your teams once. They follow you to every device.' : 'Log in to get your timeline.'}</p>
        <form onSubmit={submit} className="gate-form">
          <input type="email" name="email" aria-label="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <span className="pw">
            <input type={show ? 'text' : 'password'} name="password" aria-label="Password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={signup ? 'Password (8+ characters)' : 'Password'} />
            <button type="button" className="link" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
          </span>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'One sec…' : signup ? 'Create account' : 'Log in'}</button>
        </form>
        <button className="link switch-mode" onClick={() => { setMode(signup ? 'login' : 'signup'); setError(''); }}>
          {signup ? 'Have an account? Log in' : 'New here? Sign up'}
        </button>
      </aside>

      {events?.length === 0 ? null : (
      <section className="preview" aria-hidden="true" inert>
        <p className="preview-tag">Live preview · popular teams</p>
        {events === null && [0, 1, 2].map((i) => <div key={i} className="card skeleton" style={{ '--i': i }} />)}
        {events?.[0] && <Hero e={events[0]} settings={DEFAULT_SETTINGS} />}
        {groups.map(([k, list]) => (
          <div className="day" key={k}>
            <h2 className="day-head">{dayLabel(k, now, DEFAULT_SETTINGS)} <small>{list.length} {list.length === 1 ? 'game' : 'games'}</small></h2>
            {list.map((e, i) => <EventCard key={e.id} e={e} now={now} settings={DEFAULT_SETTINGS} index={i} />)}
          </div>
        ))}
        <div className="preview-fade" />
      </section>
      )}
    </div>
  );
}
