import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';
import { q, q1 } from './db.js';
import { todayIn } from './dates.js';
import { builtin, isCustomId, customToGame } from './games.js';

const COOKIE = 'sid';
const DAYS = 60;

export async function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  await q(`insert into sessions (token, user_id, expires) values ($1, $2, now() + interval '${DAYS} days')`, [token, userId]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: DAYS * 86400,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q('delete from sessions where token = $1', [token]);
  jar.delete(COOKIE);
}

export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return q1(
    `select u.id, u.username, u.display_name, u.stats_visibility from sessions s join users u on u.id = s.user_id
     where s.token = $1 and s.expires > now()`,
    [token]
  );
}

export async function requireUser(next) {
  const user = await getUser();
  if (!user) redirect('/login' + (next ? `?next=${encodeURIComponent(next)}` : ''));
  return user;
}

// "Today" for the current visitor, from the time zone cookie the browser sets.
export async function userToday() {
  return todayIn((await cookies()).get('tz')?.value);
}

// Resolve a list of game ids (built-in or custom) to game objects, keyed by id.
export async function gamesByIds(ids) {
  const out = {};
  const customIds = [];
  for (const id of new Set(ids)) {
    if (builtin(id)) out[id] = builtin(id);
    else if (isCustomId(id)) customIds.push(Number(id.slice(1)));
  }
  if (customIds.length) {
    const rows = await q('select * from custom_games where id = any($1)', [customIds]);
    for (const r of rows) out['c' + r.id] = customToGame(r);
  }
  return out;
}

// How two players are connected: 'self', 'friends', 'outgoing' (viewer asked), 'incoming' (they asked) or 'none'.
export async function relationship(viewerId, otherId) {
  if (viewerId === otherId) return 'self';
  const f = await q1(
    'select user_id, status from friendships where (user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1)',
    [viewerId, otherId]
  );
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.user_id === viewerId ? 'outgoing' : 'incoming';
}

// Who may open a player's stats page, by their own setting: 'public', 'friends' or 'private'.
// `viewer` may be null (not logged in).
export async function canSeeStats(viewer, person) {
  if (viewer?.id === person.id) return true;
  if (person.stats_visibility === 'public') return true;
  if (person.stats_visibility === 'private' || !viewer) return false;
  return (await relationship(viewer.id, person.id)) === 'friends';
}

// Do two players share a league (or a friendship)? Used for reacting to each other's results.
export async function canSee(viewerId, otherId) {
  if (viewerId === otherId) return true;
  const row = await q1(
    `select 1 as ok where exists (
       select 1 from friendships where status = 'accepted'
         and ((user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1)))
     or exists (
       select 1 from league_members a join league_members b on a.league_id = b.league_id
       where a.user_id = $1 and b.user_id = $2)`,
    [viewerId, otherId]
  );
  return !!row;
}
