'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { q, q1 } from '@/lib/db';
import { createSession, destroySession, requireUser, userToday, gamesByIds, canSee } from '@/lib/auth';
import { builtin, parseManual, expectedPuzzle } from '@/lib/games';
import { addDays, todayIn } from '@/lib/dates';

const str = (fd, k) => String(fd.get(k) ?? '').trim();

function fail(path, msg) {
  redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(msg)}`);
}
function ok(path, msg) {
  redirect(msg ? `${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : path);
}
// Only allow redirects back into this site.
const safeNext = (p) => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : '/');

/* ---------- accounts ---------- */

export async function signup(fd) {
  const username = str(fd, 'username').toLowerCase();
  const display = str(fd, 'display_name') || username;
  const password = String(fd.get('password') ?? '');
  const next = safeNext(str(fd, 'next'));
  const back = `/signup?next=${encodeURIComponent(next)}`;
  if (!/^[a-z0-9_]{3,20}$/.test(username)) fail(back, 'Username must be 3–20 letters, numbers or underscores.');
  if (password.length < 8) fail(back, 'Password must be at least 8 characters.');
  if (display.length > 30) fail(back, 'Display name is too long.');
  if (await q1('select 1 from users where username = $1', [username])) fail(back, 'That username is taken.');
  const hash = await bcrypt.hash(password, 10);
  const user = await q1(
    'insert into users (username, display_name, pass_hash) values ($1, $2, $3) returning id',
    [username, display, hash]
  );
  await createSession(user.id);
  redirect(next);
}

export async function login(fd) {
  const username = str(fd, 'username').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const next = safeNext(str(fd, 'next'));
  const user = await q1('select id, pass_hash from users where username = $1', [username]);
  if (!user || !(await bcrypt.compare(password, user.pass_hash))) {
    fail(`/login?next=${encodeURIComponent(next)}`, 'Wrong username or password.');
  }
  await createSession(user.id);
  redirect(next);
}

export async function logout() {
  await destroySession();
  redirect('/login');
}

/* ---------- games ---------- */

export async function toggleGame(fd) {
  const user = await requireUser();
  const id = str(fd, 'game');
  const games = await gamesByIds([id]);
  if (!games[id]) fail('/games', 'Unknown game.');
  const has = await q1('select 1 from user_games where user_id = $1 and game_id = $2', [user.id, id]);
  if (has) await q('delete from user_games where user_id = $1 and game_id = $2', [user.id, id]);
  else await q('insert into user_games (user_id, game_id) values ($1, $2)', [user.id, id]);
  revalidatePath('/games');
}

export async function createCustomGame(fd) {
  const user = await requireUser();
  const name = str(fd, 'name');
  let url = str(fd, 'url');
  const unit = str(fd, 'unit') || 'pts';
  const higher = str(fd, 'direction') === 'higher';
  if (name.length < 2 || name.length > 40) fail('/games', 'Give the game a name (2–40 characters).');
  if (unit.length > 12) fail('/games', 'Unit is too long.');
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (url.length > 200) fail('/games', 'Link is too long.');
  const row = await q1(
    'insert into custom_games (name, url, higher_better, unit, created_by) values ($1, $2, $3, $4, $5) returning id',
    [name, url || null, higher, unit, user.id]
  );
  await q('insert into user_games (user_id, game_id) values ($1, $2)', [user.id, 'c' + row.id]);
  ok('/games', `${name} added.`);
}

export async function submitScore(fd) {
  const user = await requireUser();
  const id = str(fd, 'game');
  const text = String(fd.get('text') ?? '').slice(0, 2000).trim();
  const manualInput = str(fd, 'manual');
  const game = (await gamesByIds([id]))[id];
  if (!game) fail('/', 'Unknown game.');

  // The day is the player's local day, but never more than a day away from UTC.
  const date = await userToday();
  const utc = todayIn('UTC');
  if (date < addDays(utc, -1) || date > addDays(utc, 1)) fail('/', 'Your device date looks wrong.');

  let score = null, puzzleNo = null, manual = false, flagged = false;
  if (text && game.parse) {
    const parsed = game.parse(text);
    if (!parsed) fail('/', `That doesn't look like a ${game.name} result. Paste the text from the game's Share button, or enter the score manually.`);
    ({ score, puzzleNo } = parsed);
  } else {
    score = parseManual(game, manualInput);
    if (score === null) fail('/', `Enter a valid ${game.name} score.`);
    manual = true;
  }

  if (puzzleNo !== null) {
    // Reject results from a different day's puzzle.
    const expected = expectedPuzzle(game, date);
    if (expected !== null && Math.abs(puzzleNo - expected) > 1) {
      fail('/', `That is ${game.name} #${puzzleNo}, which isn't today's puzzle.`);
    }
    // Where the puzzle number can't be worked out, compare with what others posted today.
    if (expected === null) {
      const other = await q1(
        `select puzzle_no from scores where game_id = $1 and play_date = $2 and puzzle_no is not null
         group by puzzle_no order by count(*) desc limit 1`,
        [id, date]
      );
      if (other && Math.abs(other.puzzle_no - puzzleNo) > 1) flagged = true;
    }
    const reused = await q1(
      'select 1 from scores where user_id = $1 and game_id = $2 and puzzle_no = $3',
      [user.id, id, puzzleNo]
    );
    if (reused) fail('/', `You've already submitted ${game.name} #${puzzleNo}.`);
  }

  const res = await q(
    `insert into scores (user_id, game_id, play_date, score, puzzle_no, raw, manual, flagged)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (user_id, game_id, play_date) do nothing returning id`,
    [user.id, id, date, score, puzzleNo, manual ? null : text, manual, flagged]
  );
  if (!res.length) fail('/', `You've already submitted ${game.name} today. Scores are locked once posted.`);
  await q('insert into user_games (user_id, game_id) values ($1, $2) on conflict do nothing', [user.id, id]);
  ok('/', `${game.name} score saved.`);
}

/* ---------- leagues ---------- */

async function membership(leagueId, userId) {
  return q1(
    `select l.*, (m.user_id is not null) as is_member from leagues l
     left join league_members m on m.league_id = l.id and m.user_id = $2 where l.id = $1`,
    [leagueId, userId]
  );
}

export async function createLeague(fd) {
  const user = await requireUser();
  const name = str(fd, 'name');
  const ids = fd.getAll('games').map(String);
  if (name.length < 2 || name.length > 40) fail('/leagues', 'Give the league a name (2–40 characters).');
  const games = await gamesByIds(ids);
  if (!Object.keys(games).length) fail('/leagues', 'Pick at least one game.');
  const code = randomBytes(5).toString('hex');
  const league = await q1('insert into leagues (name, code, owner_id) values ($1, $2, $3) returning id', [name, code, user.id]);
  await q('insert into league_members (league_id, user_id) values ($1, $2)', [league.id, user.id]);
  for (const id of Object.keys(games)) {
    await q('insert into league_games (league_id, game_id) values ($1, $2)', [league.id, id]);
  }
  redirect(`/leagues/${league.id}`);
}

export async function joinLeague(fd) {
  const user = await requireUser();
  // Accept either a bare code or a pasted invite link.
  const code = str(fd, 'code').split('/').pop().toLowerCase();
  const league = await q1('select id from leagues where code = $1', [code]);
  if (!league) fail('/leagues', 'No league found for that invite code.');
  await q('insert into league_members (league_id, user_id) values ($1, $2) on conflict do nothing', [league.id, user.id]);
  await q('delete from league_invites where league_id = $1 and user_id = $2', [league.id, user.id]);
  redirect(`/leagues/${league.id}`);
}

export async function leaveLeague(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const league = await membership(id, user.id);
  if (!league?.is_member) fail('/leagues', 'You are not in that league.');
  if (league.owner_id === user.id) {
    // The owner leaving hands the league to the longest-standing member, or closes it if empty.
    const heir = await q1(
      'select user_id from league_members where league_id = $1 and user_id <> $2 order by joined_at limit 1',
      [id, user.id]
    );
    if (heir) await q('update leagues set owner_id = $1 where id = $2', [heir.user_id, id]);
    else {
      await q('delete from leagues where id = $1', [id]);
      ok('/leagues', 'League closed.');
    }
  }
  await q('delete from league_members where league_id = $1 and user_id = $2', [id, user.id]);
  ok('/leagues', 'You left the league.');
}

export async function setLeagueGames(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const league = await membership(id, user.id);
  const path = `/leagues/${id}`;
  if (!league || league.owner_id !== user.id) fail('/leagues', 'Only the league owner can change its games.');
  const games = await gamesByIds(fd.getAll('games').map(String));
  if (!Object.keys(games).length) fail(path, 'A league needs at least one game.');
  await q('delete from league_games where league_id = $1', [id]);
  for (const gid of Object.keys(games)) {
    await q('insert into league_games (league_id, game_id) values ($1, $2)', [id, gid]);
  }
  ok(path, 'League games updated.');
}

export async function inviteFriend(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const friendId = Number(fd.get('friend'));
  const league = await membership(id, user.id);
  if (!league?.is_member) fail('/leagues', 'You are not in that league.');
  const friends = await q1(
    `select 1 from friendships where status = 'accepted'
     and ((user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1))`,
    [user.id, friendId]
  );
  if (!friends) fail(`/leagues/${id}`, 'You can only invite friends directly. Share the invite link instead.');
  const already = await q1('select 1 from league_members where league_id = $1 and user_id = $2', [id, friendId]);
  if (!already) {
    await q(
      'insert into league_invites (league_id, user_id, invited_by) values ($1, $2, $3) on conflict do nothing',
      [id, friendId, user.id]
    );
  }
  ok(`/leagues/${id}`, 'Invite sent.');
}

export async function respondInvite(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const invite = await q1('delete from league_invites where league_id = $1 and user_id = $2 returning league_id', [id, user.id]);
  if (invite && str(fd, 'answer') === 'accept') {
    await q('insert into league_members (league_id, user_id) values ($1, $2) on conflict do nothing', [id, user.id]);
    redirect(`/leagues/${id}`);
  }
  revalidatePath('/');
}

/* ---------- friends ---------- */

export async function addFriend(fd) {
  const user = await requireUser();
  const username = str(fd, 'username').toLowerCase().replace(/^@/, '');
  const other = await q1('select id, display_name from users where username = $1', [username]);
  if (!other) fail('/friends', `No player called @${username}.`);
  if (other.id === user.id) fail('/friends', "That's you.");
  const existing = await q1(
    'select user_id, status from friendships where (user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1)',
    [user.id, other.id]
  );
  if (existing?.status === 'accepted') fail('/friends', 'You are already friends.');
  if (existing && existing.user_id === user.id) fail('/friends', 'Request already sent.');
  if (existing) {
    // They had already asked us: accept.
    await q(`update friendships set status = 'accepted' where user_id = $1 and friend_id = $2`, [other.id, user.id]);
    ok('/friends', `You and ${other.display_name} are now friends.`);
  }
  await q('insert into friendships (user_id, friend_id) values ($1, $2)', [user.id, other.id]);
  ok('/friends', 'Friend request sent.');
}

export async function respondFriend(fd) {
  const user = await requireUser();
  const from = Number(fd.get('from'));
  if (str(fd, 'answer') === 'accept') {
    await q(`update friendships set status = 'accepted' where user_id = $1 and friend_id = $2`, [from, user.id]);
  } else {
    await q(`delete from friendships where user_id = $1 and friend_id = $2 and status = 'pending'`, [from, user.id]);
  }
  revalidatePath('/friends');
}

export async function removeFriend(fd) {
  const user = await requireUser();
  const other = Number(fd.get('friend'));
  await q(
    'delete from friendships where (user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1)',
    [user.id, other]
  );
  revalidatePath('/friends');
}

/* ---------- reactions ---------- */

const REACTIONS = ['👏', '🔥', '😂', '💀'];

export async function react(fd) {
  const user = await requireUser();
  const scoreId = Number(fd.get('score'));
  const emoji = str(fd, 'emoji');
  const back = safeNext(str(fd, 'back'));
  const score = await q1('select user_id from scores where id = $1', [scoreId]);
  if (!score || !REACTIONS.includes(emoji) || !(await canSee(user.id, score.user_id))) return;
  const removed = await q(
    'delete from reactions where score_id = $1 and user_id = $2 and emoji = $3 returning 1',
    [scoreId, user.id, emoji]
  );
  if (!removed.length) {
    await q('insert into reactions (score_id, user_id, emoji) values ($1, $2, $3)', [scoreId, user.id, emoji]);
  }
  revalidatePath(back.split('?')[0]);
}
