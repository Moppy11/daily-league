// Sending email through Resend (resend.com). Switched on by two settings in the hosting environment:
//   RESEND_API_KEY  the API key from Resend
//   EMAIL_FROM      the sender, e.g. "Daily League <hello@yourdomain.com>" on a domain verified in Resend
// Without them the site still works; password reset by email just isn't offered.
import { headers } from 'next/headers';

export const emailEnabled = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export const validEmail = (s) => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function sendEmail({ to, subject, text, html }) {
  if (!emailEnabled()) return false;
  try {
    // RESEND_API_URL exists only so tests can point this at a stand-in server.
    const res = await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// The site's own address, for links in emails. Taken from settings rather than the incoming request
// so a forged Host header can't make a reset link point somewhere else.
export async function siteUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers(); // local development only
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
