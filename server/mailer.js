// Resend (https://resend.com). With no RESEND_API_KEY it just logs, so dev needs no account.
export async function sendMail({ to, subject, text }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[mail:dev] to=${to} subject=${subject}\n${text}`);
    return { dev: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.FROM_EMAIL ?? 'Matchday <onboarding@resend.dev>', to, subject, text }),
  });
  if (!res.ok) throw new Error(`resend ${res.status} ${await res.text()}`);
  return { ok: true };
}
