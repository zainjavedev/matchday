// On an always-on server (Docker/VPS), set SCHEDULER=1 and reminders run inside the app every 5 minutes.
// On Vercel (serverless) leave it unset and have cron-job.org call /api/cron instead.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SCHEDULER === '1') {
    const { startScheduler } = await import('./instrumentation-node.js');
    startScheduler();
  }
}
