import React, { useState } from 'react';
import { allZones, deviceZone, timeLabel, zoneCity, zoneName } from '../lib/time.js';
import { askPermission, permission, showNotification, ntfySend, ntfyUrl } from '../lib/notify.js';
import { newTopic } from '../lib/store.js';
import { shareUrl } from '../lib/share.js';
import { Icon, Sheet, Toggle } from './ui.jsx';

const LEADS = [[0, 'At start'], [10, '10 min'], [30, '30 min'], [60, '1 hour'], [180, '3 hours']];
const API = import.meta.env.VITE_API_URL;

export function Settings({ settings, setSettings, follows, events, toast, onClose, onReset, onPermission }) {
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const [perm, setPerm] = useState(permission());
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  const enableBrowser = async () => {
    const p = await askPermission();
    setPerm(p);
    onPermission?.(p);
    if (p === 'granted') {
      set({ autoBrowser: true });
      showNotification('Matchday is on 🎉', 'You will get a ping before your games.', 'welcome');
    } else toast(p === 'unsupported' ? 'This browser has no notifications — try phone push instead.' : 'Notifications are blocked in your browser settings.');
  };

  const enablePhone = () => {
    const topic = settings.ntfyTopic || newTopic();
    set({ ntfyTopic: topic, autoPhone: true });
  };

  const testPhone = async () => {
    try {
      toast((await ntfySend(settings.ntfyTopic, 'It works! Your game alerts will land here.')) ? 'Test sent — check your phone.' : 'ntfy rejected the test.');
    } catch {
      toast('Could not reach ntfy.sh.');
    }
  };

  const subscribe = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API}/subscribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, follows, lead: settings.lead }),
      });
      toast(res.ok ? 'Check your inbox to confirm.' : 'Could not subscribe — try again.');
    } catch {
      toast('Could not reach the email service.');
    }
    setBusy(false);
  };

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
        <h3><Icon name="bell" size={18} /> Alerts</h3>
        <label className="field">
          Default heads-up
          <div className="seg">
            {LEADS.map(([v, l]) => <button key={v} className={settings.lead === v ? 'on' : ''} onClick={() => set({ lead: v })}>{l}</button>)}
          </div>
        </label>

        <div className="channel">
          <div className="ch-head"><Icon name="bell" size={18} /><b>Browser</b><span className={`state ${perm === 'granted' ? 'ok' : ''}`}>{perm === 'granted' ? 'Allowed' : perm === 'denied' ? 'Blocked' : 'Off'}</span></div>
          <p className="muted">Pops up on this device. Only fires while Matchday is open in a tab or installed as an app.</p>
          {perm !== 'granted' ? (
            <button className="btn primary" onClick={enableBrowser}>Allow notifications</button>
          ) : (
            <Toggle on={settings.autoBrowser} onChange={(v) => set({ autoBrowser: v })} label="Remind me for every game I follow" hint="Or tap the bell on individual games." />
          )}
        </div>

        <div className="channel">
          <div className="ch-head"><Icon name="phone" size={18} /><b>Phone push</b><span className={`state ${settings.ntfyTopic ? 'ok' : ''}`}>{settings.ntfyTopic ? 'Set up' : 'Free'}</span></div>
          <p className="muted">Works with the app closed and your laptop off, via the free <b>ntfy</b> app. Each time you open Matchday it queues the next 3 days of alerts.</p>
          {!settings.ntfyTopic ? (
            <button className="btn primary" onClick={enablePhone}>Set up phone push</button>
          ) : (
            <>
              <ol className="steps">
                <li>Install <b>ntfy</b> (iOS / Android).</li>
                <li>Tap + and subscribe to this topic:</li>
              </ol>
              <div className="copy-row">
                <code>{settings.ntfyTopic}</code>
                <button className="btn small" onClick={() => navigator.clipboard?.writeText(settings.ntfyTopic).then(() => toast('Topic copied'))}>Copy</button>
                <a className="btn small" href={ntfyUrl(settings.ntfyTopic)} target="_blank" rel="noreferrer">Open</a>
              </div>
              <p className="muted tiny">Anyone who knows this topic name can read it — keep it private.</p>
              <div className="row-actions">
                <button className="btn small" onClick={testPhone}>Send test</button>
                <button className="btn small" onClick={() => set({ ntfyTopic: newTopic() })}>New topic</button>
              </div>
              <Toggle on={settings.autoPhone} onChange={(v) => set({ autoPhone: v })} label="Push every game I follow" hint="Bell-tapped games are always pushed." />
            </>
          )}
        </div>

        <div className="channel">
          <div className="ch-head"><Icon name="mail" size={18} /><b>Email, Telegram, WhatsApp</b><span className="state">{API ? 'Ready' : 'Needs server'}</span></div>
          {API ? (
            <form onSubmit={subscribe} className="email-form">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email address" />
              <button className="btn primary" disabled={busy || !follows.length}>Email me</button>
            </form>
          ) : (
            <p className="muted">These send while every device is off, so they need the small free server in <code>worker/</code>. Until then, phone push covers you.</p>
          )}
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
          <button className="btn danger" onClick={() => { if (confirm('Remove all teams and reminders?')) { onReset(); onClose(); } }}>Reset everything</button>
        </div>
      </section>
    </Sheet>
  );
}
