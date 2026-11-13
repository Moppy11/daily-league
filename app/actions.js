'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomBytes, createHash } from 'node:crypto';
import { emailEnabled, validEmail, sendEmail, siteUrl, escapeHtml } from '@/lib/email';
import { q, q1 } from '@/lib/db';
import { createSession, destroySession, requireUser, userToday, gamesByIds, canSee } from '@/lib/auth';
import { parseManual, expectedPuzzle, puzzleDate, detectGame } from '@/lib/games';
import { addDays, todayIn, prettyDate } from '@/lib/dates';
import { notify } from '@/lib/notify';
import { sendPush } from '@/lib/push';
import { formatScore } from '@/lib/games';

const str = (fd, k) => String(fd.get(k) ?? '').trim();

function fail(path, msg) {
  redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(msg)}`);
}
function ok(path, msg) {
  redirect(msg ? `${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : path);
}
// Only allow redirects back into this site.
const safeNext = (p) => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : '/');

/* ---------- landing page demo ---------- */

// Reads a pasted result for the front page's "try it" box. Nothing is saved and no account is needed.
export async function previewResult(text) {
  const found = detectGame(String(text ?? '').slice(0, 2000));
  if (!found) return { ok: false };
  const { game, puzzleNo, score } = found;
  const expected = expectedPuzzle(game, await userToday());
  const isToday = puzzleNo === null || expected === null ? null : Math.abs(puzzleNo - expected) <= 1;
  return { ok: true, name: game.name, emoji: game.emoji, score: formatScore(game, score), higherBetter: game.higherBetter, isToday };
}

/* ---------- accounts ---------- */

export async function signup(fd) {
  const username = str(fd, 'username').toLowerCase();
  const display = str(fd, 'display_name') || username;
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const next = safeNext(str(fd, 'next'));
  const back = `/signup?next=${encodeURIComponent(next)}`;
  if (!/^[a-z0-9_]{3,20}$/.test(username)) fail(back, 'Username must be 3–20 letters, numbers or underscores.');
  if (!validEmail(email)) fail(back, 'Enter a valid email address.');
  if (password.length < 8) fail(back, 'Password must be at least 8 characters.');
  if (display.length > 30) fail(back, 'Display name is too long.');
  if (await q1('select 1 from users where username = $1', [username])) fail(back, 'That username is taken.');
  const emailTaken = 'An account already uses that email. Log in, or reset your password from the log-in page.';
  if (await q1('select 1 from users where lower(email) = $1', [email])) fail(back, emailTaken);
  const hash = await bcrypt.hash(password, 10);
  const user = await q1(
    'insert into users (username, display_name, pass_hash, email) values ($1, $2, $3, $4) on conflict do nothing returning id',
    [username, display, hash, email]
  );
  // Someone else took the username or email in the moment between the checks and the insert.
  if (!user) fail(back, (await q1('select 1 from users where username = $1', [username])) ? 'That username is taken.' : emailTaken);
  await createSession(user.id);
  redirect(next);
}

export async function login(fd) {
  const username = str(fd, 'username').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const next = safeNext(str(fd, 'next'));
  // Either the username or the email address works.
  const user = await q1('select id, pass_hash from users where username = $1 or lower(email) = $1', [username]);
  if (!user || !(await bcrypt.compare(password, user.pass_hash))) {
    fail(`/login?next=${encodeURIComponent(next)}`, 'Wrong username, email or password.');
  }
  await createSession(user.id);
  redirect(next);
}

/* ---------- email and reset links ---------- */

const tokenHash = (t) => createHash('sha256').update(t).digest('hex');

// Email a one-hour reset link. The reply is the same whether or not the account exists or has an email,
// so the form can't be used to find out who has an account.
export async function requestReset(fd) {
  const who = str(fd, 'who').toLowerCase().replace(/^@/, '');
  if (!emailEnabled()) fail('/forgot', "Reset by email isn't switched on yet. Use a recovery code instead.");
  if (!who) fail('/forgot', 'Enter your username or email.');
  const user = await q1('select id, username, email from users where (username = $1 or lower(email) = $1) and email is not null', [who]);
  if (user) {
    const recent = await q1(`select count(*) as n from password_resets where user_id = $1 and created_at > now() - interval '1 hour'`, [user.id]);
    if (recent.n < 3) {
      const token = randomBytes(32).toString('base64url');
      await q(`insert into password_resets (token_hash, user_id, expires) values ($1, $2, now() + interval '1 hour')`, [tokenHash(token), user.id]);
      await q(`delete from password_resets where expires < now() - interval '1 day'`);
      const link = `${await siteUrl()}/reset/${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your Daily League password',
        text: `Hi ${user.username},\n\nUse this link to choose a new Daily League password. It works once, for the next hour:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email; your password hasn't changed.`,
        html: `<p>Hi ${escapeHtml(user.username)},</p><p>Use this link to choose a new Daily League password. It works once, for the next hour:</p>`
          + `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#2f6bff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Reset my password</a></p>`
          + `<p style="color:#666">If you didn't ask for this, you can ignore this email; your password hasn't changed.</p>`,
      });
    }
  }
  ok('/forgot', "If that account has an email address, a reset link is on its way. Check your inbox (and spam folder); the link works for one hour.");
}

export async function resetWithLink(fd) {
  const token = str(fd, 'token');
  const back = `/reset/${encodeURIComponent(token)}`;
  const password = String(fd.get('password') ?? '');
  if (password.length < 8) fail(back, 'Password must be at least 8 characters.');
  // Used and checked in one step, so a link can never work twice.
  const row = await q1(
    `update password_resets set used_at = now() where token_hash = $1 and used_at is null and expires > now() returning user_id`,
    [tokenHash(token)]
  );
  if (!row) fail('/forgot', 'That reset link has expired or already been used. Ask for a new one.');
  await q('update users set pass_hash = $1 where id = $2', [await bcrypt.hash(password, 10), row.user_id]);
  await q('delete from sessions where user_id = $1', [row.user_id]);
  await q('update password_resets set used_at = now() where user_id = $1 and used_at is null', [row.user_id]);
  await createSession(row.user_id);
  ok('/', 'Password changed. You are logged in.');
}

export async function setEmail(fd) {
  const user = await requireUser();
  const email = str(fd, 'email').toLowerCase();
  const row = await q1('select pass_hash from users where id = $1', [user.id]);
  if (!validEmail(email)) fail('/settings', 'Enter a valid email address.');
  if (!(await bcrypt.compare(String(fd.get('password') ?? ''), row.pass_hash))) fail('/settings', 'Wrong password. Your email was not changed.');
  if (await q1('select 1 from users where lower(email) = $1 and id <> $2', [email, user.id])) fail('/settings', 'Another account already uses that email.');
  await q('update users set email = $1 where id = $2', [email, user.id]);
  ok('/settings', 'Email saved.');
}

// One-time code for resetting a forgotten password. Shown once; only its hash is kept.
export async function createRecoveryCode() {
  const user = await requireUser();
  const code = randomBytes(10).toString('hex').match(/.{4}/g).join('-');
  await q('update users set recovery_hash = $1 where id = $2', [await bcrypt.hash(code, 10), user.id]);
  return { code };
}

export async function resetPassword(fd) {
  const username = str(fd, 'username').toLowerCase();
  const code = str(fd, 'code').toLowerCase().replace(/\s/g, '');
  const password = String(fd.get('password') ?? '');
  if (password.length < 8) fail('/reset', 'Password must be at least 8 characters.');
  const user = await q1('select id, recovery_hash from users where username = $1', [username]);
  // Same message whether the username or the code is wrong.
  if (!user?.recovery_hash || !(await bcrypt.compare(code, user.recovery_hash))) fail('/reset', 'That username and recovery code don\'t match.');
  await q('update users set pass_hash = $1, recovery_hash = null where id = $2', [await bcrypt.hash(password, 10), user.id]);
  await q('delete from sessions where user_id = $1', [user.id]);
  await createSession(user.id);
  await notify([user.id], { kind: 'account', link: '/settings', body: 'Password reset. Your recovery code has been used, so create a new one.' });
  redirect('/');
}

export async function deleteAccount(fd) {
  const user = await requireUser();
  const row = await q1('select pass_hash from users where id = $1', [user.id]);
  if (!(await bcrypt.compare(String(fd.get('password') ?? ''), row.pass_hash))) fail('/settings', 'Wrong password. Your account was not deleted.');
  // Leagues this player runs pass to their longest-standing other member; empty ones close.
  const owned = await q('select id from leagues where owner_id = $1', [user.id]);
  for (const l of owned) {
    const heir = await q1('select user_id from league_members where league_id = $1 and user_id <> $2 order by joined_at limit 1', [l.id, user.id]);
    if (heir) await q('update leagues set owner_id = $1 where id = $2', [heir.user_id, l.id]);
  }
  await q('delete from users where id = $1', [user.id]);
  await destroySession();
  redirect('/');
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
  const today = await userToday();
  let date = today;
  const utc = todayIn('UTC');
  if (date < addDays(utc, -1) || date > addDays(utc, 1)) fail('/', 'Your device date looks wrong.');

  let score = null, puzzleNo = null, manual = false, flagged = false;
  if (text && game.parse) {
    const parsed = game.parse(text);
    if (!parsed) fail('/', `That isn't a complete ${game.name} result. Use the game's Share button and paste everything it copies, unedited.`);
    ({ score, puzzleNo } = parsed);
    // The paste box reports when the pasted text was changed before posting; such results count but are marked.
    if (fd.get('edited') === '1') manual = true;
  } else {
    score = parseManual(game, manualInput);
    if (score === null) fail('/', `Enter a valid ${game.name} score.`);
    manual = true;
  }

  if (puzzleNo !== null) {
    // Reject results from a different day's puzzle.
    const expected = expectedPuzzle(game, today);
    if (expected !== null && Math.abs(puzzleNo - expected) > 1) {
      fail('/', `That ${game.name} result isn't from today's puzzle.`);
    }
    // File the result under the day its puzzle belongs to, so a league always compares the same puzzle.
    date = puzzleDate(game, puzzleNo) ?? today;
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
    [user.id, id, date, score, puzzleNo, text || null, manual, flagged]
  );
  if (!res.length) fail('/', `You've already submitted ${game.name} for ${date === today ? 'today' : prettyDate(date)}. Scores are locked once posted.`);
  await q('insert into user_games (user_id, game_id) values ($1, $2) on conflict do nothing', [user.id, id]);
  // Tell league-mates in every league that counts this game.
  const mates = await q(
    `select m2.user_id, min(m.league_id) as league_id from league_members m
     join league_games g on g.league_id = m.league_id and g.game_id = $2
     join league_members m2 on m2.league_id = m.league_id and m2.user_id <> $1
     where m.user_id = $1 group by m2.user_id`,
    [user.id, id]
  );
  const byLeague = {};
  for (const r of mates) (byLeague[r.league_id] ??= []).push(r.user_id);
  for (const [leagueId, ids] of Object.entries(byLeague)) {
    await notify(ids, {
      kind: 'score', link: `/leagues/${leagueId}`,
      body: `${user.display_name} posted ${game.name}: ${formatScore(game, score)}${manual ? (text ? ' (edited after pasting)' : ' (entered by hand)') : ''}`,
    });
  }
  ok('/', date === today ? `${game.name} score saved.` : `${game.name} score saved for ${prettyDate(date)}.`);
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
  await q('insert into league_members (league_id, user_id, joined_on) values ($1, $2, $3)', [league.id, user.id, await userToday()]);
  for (const id of Object.keys(games)) {
    await q('insert into league_games (league_id, game_id) values ($1, $2)', [league.id, id]);
  }
  // Invite the friends ticked on the form. Only accepted friends can be invited this way.
  const wanted = fd.getAll('invite').map(Number).filter(Number.isInteger);
  const invited = wanted.length
    ? await q(
        `insert into league_invites (league_id, user_id, invited_by)
         select $1, u, $2 from unnest($3::int[]) u
         where exists (select 1 from friendships f where f.status = 'accepted'
           and ((f.user_id = $2 and f.friend_id = u) or (f.user_id = u and f.friend_id = $2)))
         on conflict do nothing returning user_id`,
        [league.id, user.id, wanted]
      )
    : [];
  await notify(invited.map((r) => r.user_id), { kind: 'invite', link: '/', body: `${user.display_name} invited you to ${name}` });
  if (invited.length) ok(`/leagues/${league.id}`, `League created. ${invited.length} invite${invited.length === 1 ? '' : 's'} sent.`);
  redirect(`/leagues/${league.id}`);
}

export async function joinLeague(fd) {
  const user = await requireUser();
  // Accept either a bare code or a pasted invite link.
  const code = (str(fd, 'code').toLowerCase().match(/[0-9a-f]{10}/) ?? [''])[0];
  const league = await q1('select id, name, owner_id from leagues where code = $1', [code]);
  if (!league) fail('/leagues', 'No league found for that invite code.');
  const joined = await q('insert into league_members (league_id, user_id, joined_on) values ($1, $2, $3) on conflict do nothing returning 1', [league.id, user.id, await userToday()]);
  await q('delete from league_invites where league_id = $1 and user_id = $2', [league.id, user.id]);
  if (joined.length) await notify([league.owner_id], { kind: 'join', link: `/leagues/${league.id}`, body: `${user.display_name} joined ${league.name}` });
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
  if (!league || league.owner_id !== user.id) fail('/leagues', 'Only the league admin can change its settings.');
  const name = str(fd, 'name') || league.name;
  if (name.length < 2 || name.length > 40) fail(path, 'League name must be 2–40 characters.');
  const games = await gamesByIds(fd.getAll('games').map(String));
  if (!Object.keys(games).length) fail(path, 'A league needs at least one game.');
  const cap = Number(fd.get('daily_cap'));
  await q('update leagues set name = $1, is_public = $2, drop_worst = $3, daily_cap = $4 where id = $5', [
    name, fd.get('is_public') === 'on', fd.get('drop_worst') === 'on', cap >= 1 && cap <= 10 ? cap : null, id,
  ]);
  await q('delete from league_games where league_id = $1', [id]);
  for (const gid of Object.keys(games)) {
    const w = Number(fd.get('weight_' + gid));
    await q('insert into league_games (league_id, game_id, weight) values ($1, $2, $3)', [id, gid, [1, 2, 3].includes(w) ? w : 1]);
  }
  ok(path, 'League settings saved.');
}

// Admin: hand the league to another member, or remove a member.
export async function manageMember(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const target = Number(fd.get('member'));
  const league = await membership(id, user.id);
  const path = `/leagues/${id}`;
  if (!league || league.owner_id !== user.id) fail('/leagues', 'Only the league admin can manage members.');
  if (target === user.id || !(await q1('select 1 from league_members where league_id = $1 and user_id = $2', [id, target]))) fail(path, 'Pick another member of this league.');
  if (str(fd, 'do') === 'admin') {
    await q('update leagues set owner_id = $1 where id = $2', [target, id]);
    await notify([target], { kind: 'admin', link: path, body: `${user.display_name} made you the admin of ${league.name}` });
    ok(path, 'Admin role handed over.');
  }
  await q('delete from league_members where league_id = $1 and user_id = $2', [id, target]);
  await notify([target], { kind: 'admin', link: '/leagues', body: `You were removed from ${league.name} by the admin` });
  ok(path, 'Player removed.');
}

// Any member can query a league-mate's result; the admin is told and decides.
export async function queryScore(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const scoreId = Number(fd.get('score'));
  const league = await membership(id, user.id);
  const path = fd.get('back') ? safeNext(str(fd, 'back')) : `/leagues/${id}`;
  if (!league?.is_member) fail('/leagues', 'You are not in that league.');
  const score = await q1(
    `select s.id, s.user_id, s.game_id, u.display_name from scores s join users u on u.id = s.user_id
     join league_members m on m.user_id = s.user_id and m.league_id = $2 where s.id = $1`,
    [scoreId, id]
  );
  if (!score || score.user_id === user.id) fail(path, 'You can only query another player\'s result.');
  const added = await q('insert into score_flags (score_id, user_id, league_id) values ($1, $2, $3) on conflict do nothing returning 1', [scoreId, user.id, id]);
  if (added.length) {
    const game = (await gamesByIds([score.game_id]))[score.game_id];
    await notify([league.owner_id], { kind: 'flag', link: path, body: `${user.display_name} queried ${score.display_name}'s ${game?.name ?? 'result'} in ${league.name}` });
  }
  ok(path, league.owner_id === user.id ? 'Result marked as queried.' : 'The admin has been told.');
}

// Admin: keep a queried result (clears the query) or take it out of this league's tables.
// A button that picks its own action can't also carry a value, so each choice is its own action.
export async function keepScore(fd) { return decideScore(fd, 'keep'); }
export async function removeScore(fd) { return decideScore(fd, 'remove'); }

async function decideScore(fd, choice) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const scoreId = Number(fd.get('score'));
  const league = await membership(id, user.id);
  const path = fd.get('back') ? safeNext(str(fd, 'back')) : `/leagues/${id}`;
  if (!league || league.owner_id !== user.id) fail('/leagues', 'Only the league admin can do that.');
  const score = await q1(
    `select s.id, s.user_id, s.game_id from scores s join league_members m on m.user_id = s.user_id and m.league_id = $2 where s.id = $1`,
    [scoreId, id]
  );
  if (!score) fail(path, 'That result is not in this league.');
  await q('delete from score_flags where score_id = $1 and league_id = $2', [scoreId, id]);
  if (choice === 'remove') {
    await q('insert into league_exclusions (league_id, score_id) values ($1, $2) on conflict do nothing', [id, scoreId]);
    const game = (await gamesByIds([score.game_id]))[score.game_id];
    await notify([score.user_id], { kind: 'admin', link: path, body: `The admin removed your ${game?.name ?? ''} result from ${league.name}` });
    ok(path, 'Result removed from this league.');
  }
  ok(path, 'Result kept.');
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
  if (!already) await notify([friendId], { kind: 'invite', link: '/', body: `${user.display_name} invited you to ${league.name}` });
  ok(`/leagues/${id}`, 'Invite sent.');
}

export async function respondInvite(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const invite = await q1('delete from league_invites where league_id = $1 and user_id = $2 returning league_id', [id, user.id]);
  if (invite && str(fd, 'answer') === 'accept') {
    await q('insert into league_members (league_id, user_id, joined_on) values ($1, $2, $3) on conflict do nothing', [id, user.id, await userToday()]);
    const league = await q1('select name, owner_id from leagues where id = $1', [id]);
    if (league) await notify([league.owner_id], { kind: 'join', link: `/leagues/${id}`, body: `${user.display_name} joined ${league.name}` });
    redirect(`/leagues/${id}`);
  }
  revalidatePath('/');
}

/* ---------- league chat, game requests, reminders ---------- */

export async function postMessage(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const body = String(fd.get('body') ?? '').trim().slice(0, 500);
  const league = await membership(id, user.id);
  const path = `/leagues/${id}/chat`;
  if (!league?.is_member) fail('/leagues', 'You are not in that league.');
  if (!body) fail(path, 'Write a message first.');
  await q('insert into league_messages (league_id, user_id, body) values ($1, $2, $3)', [id, user.id, body]);
  const others = await q('select user_id from league_members where league_id = $1 and user_id <> $2', [id, user.id]);
  await notify(others.map((r) => r.user_id), { kind: 'chat', link: path, body: `New messages in ${league.name}`, once: true });
  redirect(path);
}

export async function requestGame(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const gameId = str(fd, 'game');
  const league = await membership(id, user.id);
  const path = `/leagues/${id}/chat`;
  if (!league?.is_member) fail('/leagues', 'You are not in that league.');
  const game = (await gamesByIds([gameId]))[gameId];
  if (!game) fail(path, 'Pick a game to request.');
  if (await q1('select 1 from league_games where league_id = $1 and game_id = $2', [id, gameId])) fail(path, `${game.name} already counts in this league.`);
  if (await q1(`select 1 from league_messages where league_id = $1 and game_id = $2 and kind = 'request' and status = 'pending'`, [id, gameId])) {
    fail(path, `${game.name} has already been requested.`);
  }
  await q(`insert into league_messages (league_id, user_id, kind, game_id, status) values ($1, $2, 'request', $3, 'pending')`, [id, user.id, gameId]);
  await notify([league.owner_id], { kind: 'request', link: path, body: `${user.display_name} asked to add ${game.name} to ${league.name}` });
  ok(path, league.owner_id === user.id ? 'Request posted.' : 'Request sent to the admin.');
}

export async function decideRequest(fd) {
  const user = await requireUser();
  const msg = await q1(
    `select m.id, m.league_id, m.user_id, m.game_id, l.owner_id, l.name from league_messages m
     join leagues l on l.id = m.league_id where m.id = $1 and m.kind = 'request' and m.status = 'pending'`,
    [Number(fd.get('message'))]
  );
  if (!msg) fail('/leagues', 'That request has already been handled.');
  const path = `/leagues/${msg.league_id}/chat`;
  if (msg.owner_id !== user.id) fail(path, 'Only the league admin can decide game requests.');
  const game = (await gamesByIds([msg.game_id]))[msg.game_id];
  const approve = str(fd, 'answer') === 'approve' && game;
  if (approve) await q('insert into league_games (league_id, game_id) values ($1, $2) on conflict do nothing', [msg.league_id, msg.game_id]);
  await q('update league_messages set status = $1 where id = $2', [approve ? 'approved' : 'declined', msg.id]);
  const name = game?.name ?? 'That game';
  if (approve) {
    const members = await q('select user_id from league_members where league_id = $1 and user_id <> $2', [msg.league_id, user.id]);
    await notify(members.map((r) => r.user_id), { kind: 'request', link: `/leagues/${msg.league_id}`, body: `${name} now counts in ${msg.name}` });
  } else {
    await notify([msg.user_id], { kind: 'request', link: path, body: `The admin declined ${name} for ${msg.name}` });
  }
  ok(path, approve ? `${name} added to the league.` : 'Request declined.');
}

// Remind league-mates who haven't posted a game today. Each player gets at most one reminder per game per day.
export async function nudge(fd) {
  const user = await requireUser();
  const id = Number(fd.get('league'));
  const gameId = str(fd, 'game');
  const league = await membership(id, user.id);
  const path = `/leagues/${id}`;
  if (!league?.is_member) fail('/leagues', 'You are not in that league.');
  const game = (await gamesByIds([gameId]))[gameId];
  if (!game || !(await q1('select 1 from league_games where league_id = $1 and game_id = $2', [id, gameId]))) fail(path, 'That game is not in this league.');
  const today = await userToday();
  const body = `Reminder: play today's ${game.name} for ${league.name}`;
  const targets = await q(
    `select m.user_id from league_members m where m.league_id = $1 and m.user_id <> $2
       and not exists (select 1 from scores s where s.user_id = m.user_id and s.game_id = $3 and s.play_date = $4)
       and not exists (select 1 from notifications n where n.user_id = m.user_id and n.kind = 'nudge' and n.body = $5
                       and n.created_at > now() - interval '18 hours')`,
    [id, user.id, gameId, today, body]
  );
  await notify(targets.map((r) => r.user_id), { kind: 'nudge', link: '/', body });
  ok(path, targets.length ? `Reminder sent to ${targets.length} player${targets.length === 1 ? '' : 's'}.` : 'Everyone still to play has already been reminded today.');
}

/* ---------- push notifications and screenshot proof ---------- */

export async function savePushSub(sub) {
  const user = await requireUser();
  const endpoint = String(sub?.endpoint ?? ''), p256dh = String(sub?.keys?.p256dh ?? ''), auth = String(sub?.keys?.auth ?? '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return false;
  await q(
    `insert into push_subs (endpoint, user_id, p256dh, auth) values ($1, $2, $3, $4)
     on conflict (endpoint) do update set user_id = $2, p256dh = $3, auth = $4`,
    [endpoint, user.id, p256dh, auth]
  );
  return true;
}

export async function removePushSub(endpoint) {
  const user = await requireUser();
  await q('delete from push_subs where endpoint = $1 and user_id = $2', [String(endpoint), user.id]);
  return true;
}

export async function testPush() {
  const user = await requireUser();
  return (await sendPush([user.id], { body: 'Notifications are working on this device.', url: '/notifications' })) > 0;
}

// Attach a screenshot to one of your own results. The browser sends a shrunk JPEG.
export async function addProof(fd) {
  const user = await requireUser();
  const file = fd.get('image');
  const score = await q1('select id from scores where id = $1 and user_id = $2', [Number(fd.get('score')), user.id]);
  if (!score) return { error: 'That result isn\'t yours.' };
  if (!file || typeof file.arrayBuffer !== 'function' || file.size > 900_000) return { error: 'That picture is too large.' };
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length < 100 || data[0] !== 0xff || data[1] !== 0xd8) return { error: 'That file isn\'t a picture.' };
  await q(
    `insert into proofs (score_id, mime, data) values ($1, 'image/jpeg', $2)
     on conflict (score_id) do update set data = $2, created_at = now()`,
    [score.id, data]
  );
  await q(`delete from proofs where created_at < now() - interval '30 days'`); // screenshots are kept for a month
  return { ok: true };
}

/* ---------- chat moderation ---------- */

export async function reportMessage(fd) {
  const user = await requireUser();
  const msg = await q1(
    `select m.id, m.league_id, m.user_id, l.owner_id, l.name from league_messages m join leagues l on l.id = m.league_id
     join league_members lm on lm.league_id = m.league_id and lm.user_id = $2 where m.id = $1 and m.kind = 'chat'`,
    [Number(fd.get('message')), user.id]
  );
  if (!msg) fail('/leagues', 'That message is no longer there.');
  const path = `/leagues/${msg.league_id}/chat`;
  if (msg.user_id === user.id) fail(path, 'You can delete your own message instead.');
  const added = await q('insert into message_reports (message_id, user_id) values ($1, $2) on conflict do nothing returning 1', [msg.id, user.id]);
  if (added.length) await notify([msg.owner_id], { kind: 'flag', link: path, body: `${user.display_name} reported a message in ${msg.name}`, once: true });
  ok(path, 'Reported to the admin.');
}

// The author or the league admin can delete a chat message.
export async function deleteMessage(fd) {
  const user = await requireUser();
  const msg = await q1(
    `select m.id, m.league_id, m.user_id, l.owner_id from league_messages m join leagues l on l.id = m.league_id where m.id = $1 and m.kind = 'chat'`,
    [Number(fd.get('message'))]
  );
  if (!msg) fail('/leagues', 'That message is no longer there.');
  const path = `/leagues/${msg.league_id}/chat`;
  if (msg.user_id !== user.id && msg.owner_id !== user.id) fail(path, 'Only the author or the admin can delete a message.');
  await q('delete from league_messages where id = $1', [msg.id]);
  ok(path, 'Message deleted.');
}

export async function blockUser(fd) {
  const user = await requireUser();
  const other = await q1('select id, username, display_name from users where id = $1', [Number(fd.get('user'))]);
  if (!other || other.id === user.id) fail('/friends', 'Player not found.');
  await q('insert into blocks (user_id, blocked_id) values ($1, $2) on conflict do nothing', [user.id, other.id]);
  await q('delete from friendships where (user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1)', [user.id, other.id]);
  await q(`update duels set status = 'declined' where status in ('pending', 'accepted') and ((challenger_id = $1 and opponent_id = $2) or (challenger_id = $2 and opponent_id = $1))`, [user.id, other.id]);
  ok(`/u/${other.username}`, `${other.display_name} is blocked.`);
}

export async function unblockUser(fd) {
  const user = await requireUser();
  await q('delete from blocks where user_id = $1 and blocked_id = $2', [user.id, Number(fd.get('user'))]);
  ok(fd.get('back') ? safeNext(str(fd, 'back')) : '/settings', 'Unblocked.');
}

// True when `targetId` has blocked `senderId`.
async function blockedBy(targetId, senderId) {
  return !!(await q1('select 1 from blocks where user_id = $1 and blocked_id = $2', [targetId, senderId]));
}

/* ---------- duels ---------- */

export async function createDuel(fd) {
  const user = await requireUser();
  const other = await q1('select id, username, display_name from users where id = $1', [Number(fd.get('opponent'))]);
  const gameId = str(fd, 'game');
  const game = (await gamesByIds([gameId]))[gameId];
  if (!other || other.id === user.id) fail('/duels', 'Pick a friend to challenge.');
  const back = `/u/${other.username}`;
  const friends = await q1(
    `select 1 from friendships where status = 'accepted' and ((user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1))`,
    [user.id, other.id]
  );
  if (!friends || (await blockedBy(other.id, user.id))) fail(back, 'You can only challenge friends.');
  if (!game) fail(back, 'Pick a game for the duel.');
  const today = await userToday();
  const open = await q1(
    `select 1 from duels where game_id = $3 and status in ('pending', 'accepted') and week_start > $4::date - 7
     and ((challenger_id = $1 and opponent_id = $2) or (challenger_id = $2 and opponent_id = $1))`,
    [user.id, other.id, gameId, today]
  );
  if (open) fail(back, `You already have a ${game.name} duel with ${other.display_name}.`);
  await q('insert into duels (challenger_id, opponent_id, game_id, week_start) values ($1, $2, $3, $4)', [user.id, other.id, gameId, today]);
  await notify([other.id], { kind: 'duel', link: '/duels', body: `${user.display_name} challenged you to a week of ${game.name}` });
  ok('/duels', `Challenge sent to ${other.display_name}.`);
}

export async function acceptDuel(fd) { return answerDuel(fd, 'accepted'); }
export async function declineDuel(fd) { return answerDuel(fd, 'declined'); }

async function answerDuel(fd, status) {
  const user = await requireUser();
  const duel = await q1(
    `update duels set status = $3 where id = $1 and opponent_id = $2 and status = 'pending' returning challenger_id, game_id`,
    [Number(fd.get('duel')), user.id, status]
  );
  if (!duel) fail('/duels', 'That challenge is no longer open.');
  const game = (await gamesByIds([duel.game_id]))[duel.game_id];
  await notify([duel.challenger_id], { kind: 'duel', link: '/duels', body: `${user.display_name} ${status} your ${game?.name ?? ''} duel` });
  ok('/duels', status === 'accepted' ? 'Duel on.' : 'Challenge declined.');
}

/* ---------- public leagues ---------- */

export async function joinPublic(fd) {
  const user = await requireUser();
  const league = await q1('select id, name, owner_id from leagues where id = $1 and is_public', [Number(fd.get('league'))]);
  if (!league) fail('/leagues', 'That league is not open to join.');
  const joined = await q('insert into league_members (league_id, user_id, joined_on) values ($1, $2, $3) on conflict do nothing returning 1', [league.id, user.id, await userToday()]);
  if (joined.length) await notify([league.owner_id], { kind: 'join', link: `/leagues/${league.id}`, body: `${user.display_name} joined ${league.name}` });
  redirect(`/leagues/${league.id}`);
}

/* ---------- friends ---------- */

export async function addFriend(fd) {
  const user = await requireUser();
  const username = str(fd, 'username').toLowerCase().replace(/^@/, '');
  const back = fd.get('back') ? safeNext(str(fd, 'back')) : '/friends';
  const other = await q1('select id, display_name from users where username = $1', [username]);
  if (!other) fail(back, `No player called @${username}.`);
  if (other.id === user.id) fail(back, "That's you.");
  if (await blockedBy(other.id, user.id)) fail(back, "That player isn't accepting friend requests.");
  await q('delete from blocks where user_id = $1 and blocked_id = $2', [user.id, other.id]); // adding someone unblocks them
  const existing = await q1(
    'select user_id, status from friendships where (user_id = $1 and friend_id = $2) or (user_id = $2 and friend_id = $1)',
    [user.id, other.id]
  );
  if (existing?.status === 'accepted') fail(back, 'You are already friends.');
  if (existing && existing.user_id === user.id) fail(back, 'Request already sent.');
  if (existing) {
    // They had already asked us: accept.
    await q(`update friendships set status = 'accepted' where user_id = $1 and friend_id = $2`, [other.id, user.id]);
    await notify([other.id], { kind: 'friend', link: `/u/${user.username}`, body: `${user.display_name} accepted your friend request` });
    ok(back, `You and ${other.display_name} are now friends.`);
  }
  await q('insert into friendships (user_id, friend_id) values ($1, $2)', [user.id, other.id]);
  await notify([other.id], { kind: 'friend', link: '/friends', body: `${user.display_name} sent you a friend request` });
  ok(back, 'Friend request sent.');
}

export async function respondFriend(fd) {
  const user = await requireUser();
  const from = Number(fd.get('from'));
  if (str(fd, 'answer') === 'accept') {
    const done = await q(`update friendships set status = 'accepted' where user_id = $1 and friend_id = $2 and status = 'pending' returning 1`, [from, user.id]);
    if (done.length) await notify([from], { kind: 'friend', link: `/u/${user.username}`, body: `${user.display_name} accepted your friend request` });
  } else {
    await q(`delete from friendships where user_id = $1 and friend_id = $2 and status = 'pending'`, [from, user.id]);
  }
  if (fd.get('back')) redirect(safeNext(str(fd, 'back')));
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

export async function setVisibility(fd) {
  const user = await requireUser();
  const v = str(fd, 'visibility');
  if (!['public', 'friends', 'private'].includes(v)) fail(`/u/${user.username}`, 'Pick who can see your stats.');
  await q('update users set stats_visibility = $1 where id = $2', [v, user.id]);
  ok(`/u/${user.username}`, 'Privacy setting saved.');
}

