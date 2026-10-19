import React, { useEffect, useState } from 'react';
import { AWAY_FIRST, F1_TEAM, SPORTS } from '../lib/sports.js';
import { countdownParts, dateTimeLabel, relative, timeLabel, zoneName } from '../lib/time.js';
import { Icon, Logo } from './ui.jsx';

export const isLive = (e, now) => e.timeValid && e.state !== 'post' && (e.state === 'in' || (e.start <= now && now < e.end));

const orderSides = (e) => {
  const sides = [...e.sides];
  const homeFirst = !AWAY_FIRST.has(e.sport);
  return sides.sort((a, b) => (homeFirst ? Number(b.home) - Number(a.home) : Number(a.home) - Number(b.home)));
};

function Matchup({ e, big }) {
  if (e.kind === 'session') {
    return (
      <div className="matchup session">
        <Logo src={F1_TEAM.logo} name="F1" color="#ff1801" size={big ? 64 : 44} />
        <div className="who">
          <b className="title">{e.raceName}</b>
          <span className="muted">{e.session}</span>
        </div>
      </div>
    );
  }
  const [a, b] = orderSides(e);
  const sep = AWAY_FIRST.has(e.sport) ? '@' : 'vs';
  const Side = ({ s }) => (
    <div className={`side ${e.followIds.includes(s.id) ? 'mine' : ''}`}>
      <Logo src={s.logo} name={s.short} color={s.color} size={big ? 72 : 44} />
      <b>{s.short}</b>
      {s.score != null && <span className="score">{s.score}</span>}
    </div>
  );
  return (
    <div className="matchup">
      <Side s={a} />
      <span className="sep">{sep}</span>
      {b && <Side s={b} />}
    </div>
  );
}

const Meta = ({ e }) => (
  <div className="meta">
    <span className="chip" style={{ '--c': SPORTS[e.sport].color }}>
      {SPORTS[e.sport].emoji} {e.cls && e.sport === 'cricket' ? `${e.cls} · ` : ''}
      {e.league || SPORTS[e.sport].label}
    </span>
    {e.venue && <span className="muted venue">{e.venue}</span>}
  </div>
);

export function EventCard({ e, now, settings, index }) {
  const live = isLive(e, now);
  return (
    <article className={`card ${live ? 'is-live' : ''}`} style={{ '--i': Math.min(index, 12), '--sport': SPORTS[e.sport].color }}>
      <div className="when">
        {live ? (
          <span className="live-badge"><i /> LIVE</span>
        ) : e.timeValid ? (
          <>
            <b className="clock">{timeLabel(e.start, settings)}</b>
            <span className="tz">{zoneName(e.start, settings)}</span>
            <span className="rel">{relative(e.start, now)}</span>
          </>
        ) : (
          <b className="clock tbd">Time TBD</b>
        )}
      </div>
      <div className="body">
        <Matchup e={e} />
        <Meta e={e} />
        {live && e.detail && <span className="muted">{e.detail}</span>}
      </div>
    </article>
  );
}

const Digit = ({ v, label }) => (
  <div className="cd">
    <b key={v} className="tick">{String(v).padStart(2, '0')}</b>
    <span>{label}</span>
  </div>
);

export function Hero({ e, settings }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const c = countdownParts(e.start - now);
  const [a, b] = e.kind === 'match' ? orderSides(e) : [];
  const glow = [a?.color, b?.color].filter(Boolean);
  return (
    <section className="hero" style={{ '--g1': glow[0] || SPORTS[e.sport].color, '--g2': glow[1] || glow[0] || SPORTS[e.sport].color }}>
      <div className="hero-glow" aria-hidden="true" />
      <p className="eyebrow">Next up</p>
      <Matchup e={e} big />
      <p className="hero-when">
        {dateTimeLabel(e.start, settings)} <span className="muted">· {zoneName(e.start, settings)}</span>
      </p>
      <div className="countdown" role="timer" aria-label={`Starts in ${c.d} days ${c.h} hours ${c.m} minutes`}>
        {c.d > 0 && <Digit v={c.d} label="days" />}
        <Digit v={c.h} label="hrs" />
        <Digit v={c.m} label="min" />
        <Digit v={c.s} label="sec" />
      </div>
      <div className="hero-actions">
        <span className="remind-note"><Icon name="bellOn" size={16} /> {settings.lead === 0 ? "We'll ping you at kickoff" : `We'll remind you ${settings.lead >= 60 ? settings.lead / 60 + "h" : settings.lead + " min"} before`}</span>
        <Meta e={e} />
      </div>
    </section>
  );
}
