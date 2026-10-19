import React from 'react';
import { SPORTS } from '../lib/sports.js';
import { dateTimeLabel } from '../lib/time.js';
import { titleOf } from '../lib/title.js';
import { Icon, Sheet } from './ui.jsx';

const LEADS = [
  [0, 'At start'],
  [10, '10 min before'],
  [30, '30 min before'],
  [60, '1 hour before'],
  [180, '3 hours before'],
  [1440, '1 day before'],
];

export function RemindMenu({ event: e, manual, setManual, settings, onClose, onEnableBrowser, goSettings }) {
  const chosen = manual[e.id] ?? [];
  const toggle = (lead) => {
    const next = chosen.includes(lead) ? chosen.filter((l) => l !== lead) : [...chosen, lead];
    setManual((m) => {
      const copy = { ...m };
      if (next.length) copy[e.id] = next;
      else delete copy[e.id];
      return copy;
    });
    if (!chosen.length) onEnableBrowser();
  };
  return (
    <Sheet title="Remind me" onClose={onClose}>
      <div className="remind-head">
        <span className="chip" style={{ '--c': SPORTS[e.sport].color }}>{SPORTS[e.sport].emoji} {e.league}</span>
        <h3>{titleOf(e)}</h3>
        <p className="muted">{dateTimeLabel(e.start, settings)}</p>
      </div>
      <div className="lead-list">
        {LEADS.map(([lead, label]) => (
          <button key={lead} className={`lead ${chosen.includes(lead) ? 'on' : ''}`} onClick={() => toggle(lead)} aria-pressed={chosen.includes(lead)}>
            <Icon name={chosen.includes(lead) ? 'check' : 'bell'} size={18} /> {label}
          </button>
        ))}
      </div>
      <p className="hint">
        Delivered by your browser{settings.ntfyTopic ? ' and your phone (ntfy)' : ''}. <button className="link" onClick={goSettings}>Alert settings</button>
      </p>
    </Sheet>
  );
}
