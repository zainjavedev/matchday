import React from 'react';
import { allZones, deviceZone, timeLabel, zoneCity, zoneName } from '../lib/time.js';
import { shareUrl } from '../lib/share.js';
import { Icon, Sheet, Toggle } from './ui.jsx';

export function Settings({ settings, setSettings, follows, toast, onClose, onReset }) {
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const now = Date.now();

  return (
    <Sheet title="Settings" onClose={onClose}>
      <section className="set-sec">
        <h3><Icon name="globe" size={18} /> Time</h3>
        <p className="muted">Showing everything in <b>{zoneCity(settings)}</b> — it is {timeLabel(now, settings)} {zoneName(now, settings)} there.</p>
        <div className="field-row">
          <label>
            Timezone
            <select value={settings.tz} onChange={(e) => set({ tz: e.target.value })}>
              <option value="auto">Auto — this device ({deviceZone().replaceAll('_', ' ')})</option>
              {allZones().map((z) => <option key={z} value={z}>{z.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label>
            Clock
            <select value={settings.clock} onChange={(e) => set({ clock: e.target.value })}>
              <option value="auto">Auto</option>
              <option value="12">12-hour</option>
              <option value="24">24-hour</option>
            </select>
          </label>
        </div>
      </section>

      <section className="set-sec">
        <h3><Icon name="sun" size={18} /> Look &amp; feel</h3>
        <div className="seg">
          {[['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => <button key={v} className={settings.theme === v ? 'on' : ''} onClick={() => set({ theme: v })}>{l}</button>)}
        </div>
        <Toggle on={settings.showPractice} onChange={(v) => set({ showPractice: v })} label="Show F1 practice sessions" hint="Qualifying, sprints and races are always shown." />
      </section>

      <section className="set-sec">
        <h3><Icon name="share" size={18} /> Share &amp; reset</h3>
        <div className="row-actions">
          <button className="btn" disabled={!follows.length} onClick={() => navigator.clipboard?.writeText(shareUrl(follows)).then(() => toast('Link copied — anyone can open your lineup.'))}>Copy my lineup link</button>
          <button className="btn danger" onClick={() => { if (confirm('Remove all the teams you follow?')) { onReset(); onClose(); } }}>Remove all teams</button>
        </div>
      </section>
    </Sheet>
  );
}
