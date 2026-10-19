import React, { useEffect, useState } from 'react';
import { allZones, deviceZone, timeLabel, zoneCity, zoneName } from '../lib/time.js';
import { disablePush, enablePush, pushState } from '../lib/push.js';
import { shareUrl } from '../lib/share.js';
import { Icon, Sheet, Toggle } from './ui.jsx';

const LEADS = [[0, 'At start'], [10, '10 min'], [30, '30 min'], [60, '1 hour'], [180, '3 hours']];

export function Settings({ settings, setSettings, follows, email, push, toast, onClose, onLogout, onReset }) {
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const [device, setDevice] = useState('off');
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const pushConfigured = push?.configured && Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  useEffect(() => {
    pushState().then(setDevice);
  }, []);

  const toggleDevice = async () => {
    setBusy(true);
    const next = device === 'on' ? await disablePush() : await enablePush();
    setDevice(next);
    if (next === 'denied') toast('Notifications are blocked in your browser settings.');
    setBusy(false);
  };

  const test = async (channel) => {
    setBusy(true);
    try {
      const res = await fetch('/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel }) });
      const data = await res.json().catch(() => ({}));
      toast(res.ok && data.ok !== false ? (channel === 'email' ? `Sent to ${email}` : 'Sent — look at this device.') : channel === 'email' ? 'Could not send the email.' : 'No device is registered yet.');
    } catch {
      toast('Could not reach the server.');
    }
    setBusy(false);
  };

  const stateLabel = { on: 'On', off: 'Off', denied: 'Blocked', unsupported: 'Not supported' }[device];

  return (
    <Sheet title="Settings" onClose={onClose}>
      <section className="set-sec">
        <h3><Icon name="mail" size={18} /> Account</h3>
        <p className="muted">Signed in as <b>{email}</b>. Your teams and settings load on any device you log in on.</p>
        <div className="row-actions">
          <button className="btn small" onClick={onLogout}>Log out</button>
        </div>
      </section>

      <section className="set-sec">
        <h3><Icon name="bell" size={18} /> Reminders</h3>
        <p className="muted">Every game of every team you follow gets a reminder automatically.</p>
        <label className="field">
          How early
          <div className="seg">
            {LEADS.map(([v, l]) => <button key={v} className={settings.lead === v ? 'on' : ''} onClick={() => set({ lead: v })}>{l}</button>)}
          </div>
        </label>

        <div className="channel">
          <div className="ch-head"><Icon name="mail" size={18} /><b>Email</b><span className={`state ${settings.email ? 'ok' : ''}`}>{settings.email ? 'On' : 'Off'}</span></div>
          <Toggle on={settings.email} onChange={(v) => set({ email: v })} label={`Email me at ${email}`} hint="Works even when all your devices are off." />
          <button className="btn small" disabled={busy} onClick={() => test('email')}>Send a test email</button>
        </div>

        <div className="channel">
          <div className="ch-head"><Icon name="phone" size={18} /><b>Notifications on this device</b><span className={`state ${device === 'on' ? 'ok' : ''}`}>{pushConfigured ? stateLabel : 'Not set up'}</span></div>
          {pushConfigured ? (
            <>
              <p className="muted">A pop-up on this phone or laptop, even with Matchday closed. Turn it on separately on each device. On iPhone, first use Share → Add to Home Screen.</p>
              {device === 'unsupported' ? (
                <p className="muted tiny">This browser can’t receive push notifications. Email still works.</p>
              ) : (
                <div className="row-actions">
                  <button className="btn primary small" disabled={busy || device === 'denied'} onClick={toggleDevice}>{device === 'on' ? 'Turn off on this device' : 'Turn on for this device'}</button>
                  {device === 'on' && <button className="btn small" disabled={busy} onClick={() => test('push')}>Send a test</button>}
                </div>
              )}
            </>
          ) : (
            <p className="muted">Device notifications need the server’s push keys (see README). Email works without them.</p>
          )}
        </div>
      </section>

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
