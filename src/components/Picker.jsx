import React, { useMemo, useState } from 'react';
import { SPORTS, SPORT_ORDER } from '../lib/sports.js';
import { Icon, Logo, Sheet } from './ui.jsx';

const LEAGUE_RANK = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'MLS', 'Primeira Liga', 'Eredivisie', 'Süper Lig', 'International', 'Indian Premier League', 'Pakistan Super League', 'Big Bash League'];
const rank = (l) => {
  const i = LEAGUE_RANK.indexOf(l);
  return i === -1 ? 99 : i;
};

export function Picker({ teams, follows, onToggle, onClose, startTab = 'soccer' }) {
  const [tab, setTab] = useState(startTab);
  const [q, setQ] = useState('');
  const [league, setLeague] = useState('all');
  const followSet = useMemo(() => new Set(follows), [follows]);

  const counts = useMemo(() => {
    const c = {};
    for (const id of follows) c[id.split(':')[0]] = (c[id.split(':')[0]] || 0) + 1;
    return c;
  }, [follows]);

  const pool = useMemo(() => teams.filter((t) => t.sport === tab).sort((a, b) => rank(a.league) - rank(b.league) || a.league.localeCompare(b.league) || a.name.localeCompare(b.name)), [teams, tab]);
  const leagues = useMemo(() => [...new Set(pool.map((t) => t.league))], [pool]);
  const term = q.trim().toLowerCase();
  const list = useMemo(() => {
    const base = term ? teams : pool.filter((t) => league === 'all' || t.league === league);
    if (!term) return base;
    return base.filter((t) => `${t.name} ${t.short} ${t.abbr} ${t.league}`.toLowerCase().includes(term));
  }, [teams, pool, league, term]);

  const switchTab = (t) => {
    setTab(t);
    setLeague('all');
    setQ('');
  };

  return (
    <Sheet title="Choose your teams" onClose={onClose} wide>
      {(close) => (
        <>
          <div className="tabs" role="tablist">
            {SPORT_ORDER.map((s) => (
              <button key={s} role="tab" aria-selected={tab === s && !term} className={`tab ${tab === s && !term ? 'on' : ''}`} onClick={() => switchTab(s)}>
                <span>{SPORTS[s].emoji}</span> {SPORTS[s].label}
                {counts[s] > 0 && <em>{counts[s]}</em>}
              </button>
            ))}
          </div>
          <label className="search">
            <Icon name="search" size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any team — Lakers, Barcelona, Pakistan…" aria-label="Search teams" />
          </label>
          {!term && leagues.length > 1 && (
            <div className="pills">
              <button className={`pill ${league === 'all' ? 'on' : ''}`} onClick={() => setLeague('all')}>All</button>
              {leagues.map((l) => (
                <button key={l} className={`pill ${league === l ? 'on' : ''}`} onClick={() => setLeague(l)}>{l}</button>
              ))}
            </div>
          )}
          <div className="grid">
            {list.map((t) => {
              const on = followSet.has(t.id);
              return (
                <button key={t.id} className={`tile ${on ? 'on' : ''}`} onClick={() => onToggle(t.id)} aria-pressed={on} title={t.name} style={{ '--tc': t.color || SPORTS[t.sport].color }}>
                  <span className="tick-badge"><Icon name="check" size={14} /></span>
                  <Logo src={t.logo} name={t.short} color={t.color} size={52} />
                  <b>{t.short.length > 18 ? t.abbr || t.short : t.short}</b>
                  {term && <small>{t.league}</small>}
                </button>
              );
            })}
            {!list.length && <p className="empty-note">No teams match “{q}”.</p>}
          </div>
          <footer className="sheet-foot">
            <span>{follows.length} following</span>
            <button className="btn primary" onClick={close}>Done</button>
          </footer>
        </>
      )}
    </Sheet>
  );
}
