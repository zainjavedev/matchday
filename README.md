# Matchday

Pick your teams across football, NBA, NFL, NHL, MLB, F1 and cricket. Every upcoming game lands in one timeline, in the viewer's own timezone. Make an account (email + password) once and your teams and settings follow you to any browser or phone. Every game gets a reminder by default, by email and by notification.

```bash
cp .env.example .env.local   # optional in dev: everything has a fallback
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit + database tests
npm run smoke                # live check of the ESPN / Jolpica data layer
npm run teams                # rebuild public/teams.json (every few months)
```

In dev there is no setup: data is stored in a JSON file (`.data/db.json`), and emails are printed to the server log instead of sent.

## How it works
- **Data:** ESPN's public JSON (NBA/NFL/NHL/MLB/football/cricket) and Jolpica (F1), fetched in the browser to draw the timeline and on the server to decide reminders. ESPN's API is unofficial and can change; `npm run smoke` checks it still works.
- **Accounts:** email + password (scrypt-hashed), 180-day session cookie, lock-out after repeated wrong passwords. Teams and settings live in one JSON file (`server/store.js`). There is no password reset yet.
- **Reminders:** `/api/cron` finds every game that has entered its "30 minutes before" window and emails / notifies the followers once. Something has to call it every ~5 minutes, see below.

## Deploy
**This needs a server with a disk that persists** (a VPS or Docker with a volume), because the database is a JSON file. It will **not** work on Vercel or other serverless hosts, whose filesystem is read-only. Set the variables in `.env.example`, keep `.data/` on a volume and back it up, and run as a single instance. You also need a Resend key for email and VAPID keys for device notifications (`npm run vapid`).

**Reminder timing:** set `SCHEDULER=1`. The app runs the check itself every 5 minutes, so no external cron is needed. (`/api/cron` with `Authorization: Bearer <CRON_SECRET>` is also available if you'd rather trigger it yourself.)

Resend's free sender (`onboarding@resend.dev`) only delivers to the address you signed up with, until you verify a domain. iPhone needs the site added to the Home Screen before device notifications work.
