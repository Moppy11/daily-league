// The weekly games vote. From Friday to Sunday 11:59pm (each player's own day), every league member votes yes or no,
// once, on each game on the ballot: the games the league plays now, plus any game a member puts forward that week.
// When the week ends, a game with 2 or more "no" votes is out next week; every other game on the ballot is in.
import { q, q1 } from './db.js';
import { addDays, weekStart, openBallotWeek } from './dates.js';
import { gamesByIds } from './auth.js';
import { notify } from './notify.js';

import { voteOutcome, NO_LIMIT, MAX_GAMES } from './voterules.js';
export { NO_LIMIT, MAX_GAMES };

export { openBallotWeek };

// Games counting on a given day, from league_games rows.
const countsOn = (r, day) => (!r.added_on || r.added_on <= day) && (!r.removed_on || r.removed_on > day);

// The ballot for a league's vote for `week` (a Monday): its games on the Sunday before, plus nominations.
export async function ballot(leagueId, week, userId = null) {
  const sunday = addDays(week, -1);
  const rows = await q('select game_id, added_on::text, removed_on::text from league_games where league_id = $1', [leagueId]);
  const current = rows.filter((r) => countsOn(r, sunday)).map((r) => r.game_id);
  const noms = await q(
    `select n.game_id, u.display_name from vote_nominations n join users u on u.id = n.user_id
     where n.league_id = $1 and n.week = $2 order by n.created_at`, [leagueId, week]);
  const ids = [...new Set([...current, ...noms.map((n) => n.game_id)])];
  const games = await gamesByIds(ids);
  const votes = await q('select game_id, user_id, vote from game_votes where league_id = $1 and week = $2', [leagueId, week]);
  const decisions = Object.fromEntries((await q('select game_id, decision from vote_overrides where league_id = $1 and week = $2', [leagueId, week])).map((r) => [r.game_id, r.decision]));
  return ids.filter((id) => games[id]).map((id) => {
    const v = votes.filter((x) => x.game_id === id);
    return {
      game: games[id],
      inNow: current.includes(id),
      nominatedBy: noms.find((n) => n.game_id === id && !current.includes(id))?.display_name ?? null,
      yes: v.filter((x) => x.vote).length,
      no: v.filter((x) => !x.vote).length,
      mine: userId ? (v.find((x) => x.user_id === userId)?.vote ?? null) : null,
      decision: decisions[id] ?? null,
    };
  }).sort((a, b) => (b.inNow - a.inNow) || a.game.name.localeCompare(b.game.name));
}

// Once a league's vote week has started (any time from that Monday on), set its games from the votes, once.
// Games voted out stop counting that Monday; games voted in count from that Monday.
// A game counts from `week`: add it, or bring it back, unless it already counts then.
async function setIn(leagueId, id, week, have) {
  const r = have[id], sunday = addDays(week, -1);
  if (!r) { await q('insert into league_games (league_id, game_id, added_on) values ($1, $2, $3)', [leagueId, id, week]); return true; }
  if (countsOn(r, sunday)) {                     // already in: just cancel any planned stop, keeping its history
    if (r.removed_on) await q('update league_games set removed_on = null where league_id = $1 and game_id = $2', [leagueId, id]);
    return false;
  }
  // Not in last week: in from Monday (an old stretch in the league is not brought back).
  await q('update league_games set removed_on = null, added_on = $3 where league_id = $1 and game_id = $2', [leagueId, id, week]);
  return true;
}
// A game stops counting from `week` (results from that Monday on no longer count).
async function setOut(leagueId, id, week, have) {
  const r = have[id];
  if (!r || (r.removed_on && r.removed_on <= week)) return false;
  if (r.added_on && r.added_on >= week) { await q('delete from league_games where league_id = $1 and game_id = $2', [leagueId, id]); return true; }
  await q('update league_games set removed_on = $3 where league_id = $1 and game_id = $2', [leagueId, id, week]);
  return true;
}
const gameRows = async (leagueId) =>
  Object.fromEntries((await q('select game_id, added_on::text, removed_on::text from league_games where league_id = $1', [leagueId])).map((r) => [r.game_id, r]));

async function announce(leagueId, body) {
  const league = await q1('select name, owner_id from leagues where id = $1', [leagueId]);
  await q(`insert into league_messages (league_id, user_id, kind, body) values ($1, $2, 'notice', $3)`, [leagueId, league.owner_id, body]);
  const members = await q('select user_id from league_members where league_id = $1', [leagueId]);
  await notify(members.map((m) => m.user_id), { kind: 'request', link: `/leagues/${leagueId}`, body: `${league.name}: ${body.replace(/^\S+ /, '')}` });
  return league;
}

// Once a league's vote week has started (any time from that Monday on), set its games from the votes, once.
// Games voted out stop counting that Monday; games voted in count from that Monday. With more than MAX_GAMES left,
// the most "yes" votes win; a tie for the last places waits for the admin (resolveTie), and the games they pick
// count from that Monday too.
export async function applyVote(leagueId, today) {
  const week = weekStart(today);
  const cast = await q1('select count(*)::int as n from game_votes where league_id = $1 and week = $2', [leagueId, week]);
  const nominated = await q1('select count(*)::int as n from vote_nominations where league_id = $1 and week = $2', [leagueId, week]);
  const decided = await q1('select count(*)::int as n from vote_overrides where league_id = $1 and week = $2', [leagueId, week]);
  if (!cast.n && !nominated.n && !decided.n) return null;
  const claimed = await q('insert into vote_results (league_id, week) values ($1, $2) on conflict do nothing returning 1', [leagueId, week]);
  if (!claimed.length) return null;                                   // already applied

  const items = await ballot(leagueId, week);
  const { inIds, outIds, tied, slots } = voteOutcome(items);
  const have = await gameRows(leagueId);
  const added = [], removed = [];
  for (const id of inIds) if (await setIn(leagueId, id, week, have)) added.push(id);
  for (const id of outIds) if (await setOut(leagueId, id, week, have)) removed.push(id);
  // A league never ends up with no games: if every game was voted out, the vote keeps the least unpopular one.
  if (!inIds.length && !tied.length && removed.length) {
    const keep = items.filter((i) => outIds.includes(i.game.id)).sort((a, b) => a.no - b.no || b.yes - a.yes)[0];
    await q('update league_games set removed_on = null where league_id = $1 and game_id = $2', [leagueId, keep.game.id]);
    removed.splice(removed.indexOf(keep.game.id), 1);
  }
  if (tied.length) await q('update vote_results set tied = $3, slots = $4 where league_id = $1 and week = $2', [leagueId, week, tied, slots]);

  const name = (id) => items.find((i) => i.game.id === id)?.game.name ?? id;
  const parts = [];
  if (added.length) parts.push(`In: ${added.map(name).join(', ')}`);
  if (removed.length) parts.push(`Out: ${removed.map(name).join(', ')}`);
  let body = `🗳️ The games vote is in. ${parts.length ? parts.join(' · ') : 'No changes: every game stays'} this week.`;
  if (tied.length) body += ` It's a tie for the last ${slots === 1 ? 'place' : `${slots} places`} (10 games max) between ${tied.map(name).join(', ')}: the admin picks.`;
  const league = await announce(leagueId, body);
  if (tied.length) {
    await notify([league.owner_id], { kind: 'request', link: `/leagues/${leagueId}/vote`,
      body: `${league.name}: pick ${slots} of ${tied.map(name).join(', ')} for this week (tied in the games vote).` });
  }
  return { added, removed, tied, slots };
}

// A tie waiting for the admin, for the league's current week: { week, slots, items: [{ game }] } or null.
export async function pendingTie(leagueId, today) {
  const week = weekStart(today);
  const r = await q1('select tied, slots from vote_results where league_id = $1 and week = $2 and tied is not null', [leagueId, week]);
  if (!r?.tied?.length) return null;
  const games = await gamesByIds(r.tied);
  return { week, slots: r.slots, items: r.tied.filter((id) => games[id]).map((id) => ({ game: games[id] })) };
}

// The admin's pick from a tie: the picked games count from that Monday, the rest are out from that Monday.
export async function resolveTie(leagueId, today, picked) {
  const tie = await pendingTie(leagueId, today);
  if (!tie) return { error: 'There is no tie to settle.' };
  const ids = tie.items.map((i) => i.game.id);
  const chosen = [...new Set(picked)].filter((id) => ids.includes(id));
  if (chosen.length !== tie.slots) return { error: `Pick exactly ${tie.slots} game${tie.slots === 1 ? '' : 's'}.` };
  const done = await q('update vote_results set tied = null where league_id = $1 and week = $2 and tied is not null returning 1', [leagueId, tie.week]);
  if (!done.length) return { error: 'That tie has already been settled.' };
  const have = await gameRows(leagueId);
  for (const id of ids) {
    if (chosen.includes(id)) await setIn(leagueId, id, tie.week, have);
    else await setOut(leagueId, id, tie.week, have);
  }
  const name = (id) => tie.items.find((i) => i.game.id === id).game.name;
  await announce(leagueId, `🗳️ The admin settled the tie: ${chosen.map(name).join(', ')} ${chosen.length === 1 ? 'is' : 'are'} in this week${ids.length > chosen.length ? `, ${ids.filter((i) => !chosen.includes(i)).map(name).join(', ')} out` : ''}. Results from Monday count.`);
  return { chosen };
}

// Leagues where this player still has games to vote on and hasn't put the reminder away today.
export async function votePrompts(userId, today) {
  const week = openBallotWeek(today);
  if (!week) return [];
  const leagues = await q(
    `select l.id, l.name from leagues l join league_members m on m.league_id = l.id and m.user_id = $1
     where not exists (select 1 from vote_prompt_seen s where s.user_id = $1 and s.league_id = l.id and s.day = $2)`,
    [userId, today]);
  const out = [];
  for (const l of leagues) {
    const items = await ballot(l.id, week, userId);
    const left = items.filter((i) => i.mine === null).length;
    if (left) out.push({ id: l.id, name: l.name, left, total: items.length, week });
  }
  return out;
}
