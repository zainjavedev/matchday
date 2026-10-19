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

In dev there is no setup: with no hosted-store variables, data is stored in a JSON file (`.data/db.json`), and emails are printed to the server log instead of sent.

## How it works
- **Data:** ESPN's public JSON (NBA/NFL/NHL/MLB/football/cricket) and Jolpica (F1), fetched in the browser to draw the timeline and on the server to decide reminders. ESPN's API is unofficial and can change; `npm run smoke` checks it still works.
- **Accounts:** email + password (scrypt-hashed), 180-day session cookie, lock-out after repeated wrong passwords. Data lives behind `server/store.js`: Upstash Redis or Vercel Blob when configured, otherwise a JSON file. There is no password reset yet.
- **Reminders:** `/api/cron` finds every game that has entered its "30 minutes before" window and emails / notifies the followers once. Something has to call it every ~5 minutes, see below.

## Deploy
**On Vercel (or any serverless host):** the app needs a hosted store, because the filesystem is read-only. Easiest: Vercel dashboard → Storage → create a **Blob** store (private) and connect it to the project. That sets `BLOB_READ_WRITE_TOKEN` and the app uses it automatically, no other setup. Alternatively connect **Upstash Redis** (sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`), which takes priority if both are present. Add the other variables from `.env.example`, then redeploy. Vercel's free tier can't run the in-app scheduler, so point cron-job.org at `/api/cron` every 5 minutes with `Authorization: Bearer <CRON_SECRET>`.

**On a server with a persistent disk (VPS, Docker volume):** leave the hosted-store variables empty and the app uses a JSON file (`DATA_FILE`, default `.data/db.json`). Keep `.data/` on a volume, back it up, run a single instance and set `SCHEDULER=1`.

You also need a Resend key for email and VAPID keys for device notifications (`npm run vapid`).

**Reminder timing:** set `SCHEDULER=1`. The app runs the check itself every 5 minutes, so no external cron is needed. (`/api/cron` with `Authorization: Bearer <CRON_SECRET>` is also available if you'd rather trigger it yourself.)

Resend's free sender (`onboarding@resend.dev`) only delivers to the address you signed up with, until you verify a domain. iPhone needs the site added to the Home Screen before device notifications work.
