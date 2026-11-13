// Phone and desktop push notifications (Web Push).
import webpush from 'web-push';
import { q, q1 } from './db.js';

// The site's push identity. Created once and kept in the database, so there is nothing to configure.
export async function vapidKeys() {
  const read = async () => Object.fromEntries((await q(`select key, value from app_settings where key in ('vapid_public', 'vapid_private')`)).map((r) => [r.key, r.value]));
  let keys = await read();
  if (!keys.vapid_public || !keys.vapid_private) {
    const fresh = webpush.generateVAPIDKeys();
    await q(
      `insert into app_settings (key, value) values ('vapid_public', $1), ('vapid_private', $2) on conflict (key) do nothing`,
      [fresh.publicKey, fresh.privateKey]
    );
    keys = await read(); // another server instance may have won the race; everyone uses what was stored
  }
  return { publicKey: keys.vapid_public, privateKey: keys.vapid_private };
}

// Send a push to every device these users have switched on. Never throws: push is a bonus on top of
// the in-app notification. Devices that have gone away are forgotten.
export async function sendPush(userIds, { title = 'Daily League', body, url = '/' }) {
  try {
    if (!userIds.length) return 0;
    const subs = await q('select endpoint, p256dh, auth from push_subs where user_id = any($1)', [userIds]);
    if (!subs.length) return 0;
    const { publicKey, privateKey } = await vapidKeys();
    const payload = JSON.stringify({ title, body, url });
    const results = await Promise.allSettled(subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { vapidDetails: { subject: siteAddress(), publicKey, privateKey }, TTL: 12 * 3600, timeout: 4000 }
      )
    ));
    const gone = subs.filter((_, i) => results[i].status === 'rejected' && [404, 410].includes(results[i].reason?.statusCode));
    if (gone.length) await q('delete from push_subs where endpoint = any($1)', [gone.map((s) => s.endpoint)]);
    return results.filter((r) => r.status === 'fulfilled').length;
  } catch {
    return 0;
  }
}

// Push services want a contact address for the site; it follows the domain automatically.
function siteAddress() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'https://daily-league-alpha.vercel.app';
}

export async function hasPush(userId) {
  return !!(await q1('select 1 from push_subs where user_id = $1 limit 1', [userId]));
}
