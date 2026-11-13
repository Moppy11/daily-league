import { q } from './db.js';
import { gamesByIds } from './auth.js';
import { sendPush } from './push.js';

// Add an in-app notification for each user. With `once`, a user who already has an unread
// notification of the same kind and link is skipped, so busy chats don't pile up.
export async function notify(userIds, { kind, body, link = '/', once = false }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const added = await q(
    `insert into notifications (user_id, kind, body, link)
     select u, $2, $3, $4 from unnest($1::int[]) u
     where not $5 or not exists (
       select 1 from notifications n where n.user_id = u and n.kind = $2 and n.link = $4 and n.read_at is null)
     returning user_id`,
    [ids, kind, body.slice(0, 300), link, once]
  );
  // The same message goes to any phone or browser the player has switched notifications on for.
  await sendPush(added.map((r) => r.user_id), { body: body.slice(0, 300), url: link });
  // Keep the table small.
  await q(`delete from notifications where created_at < now() - interval '30 days'`);
}

export async function unreadCount(userId) {
  return (await q('select count(*) as n from notifications where user_id = $1 and read_at is null', [userId]))[0].n;
}

// Games this player follows (their own picks plus their leagues' games) with no result for `today`.
export async function remainingToday(userId, today) {
  const rows = await q(
    `select game_id from user_games where user_id = $1
     union select g.game_id from league_games g join league_members m on m.league_id = g.league_id where m.user_id = $1`,
    [userId]
  );
  const done = new Set((await q('select game_id from scores where user_id = $1 and play_date = $2', [userId, today])).map((r) => r.game_id));
  const games = await gamesByIds(rows.map((r) => r.game_id));
  return Object.values(games).filter((g) => !done.has(g.id)).sort((a, b) => a.name.localeCompare(b.name));
}
