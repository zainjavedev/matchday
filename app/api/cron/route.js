import { NextResponse } from 'next/server';
import { runReminders } from '../../../server/runReminders.js';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every ~5 minutes by cron-job.org (or the in-app scheduler). Protected by CRON_SECRET.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  return NextResponse.json(await runReminders());
}
