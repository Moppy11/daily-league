// The weekly games vote. From Friday to Sunday 11:59pm (each player's own day), every league member votes yes or no,
// once, on each game on the ballot: the games the league plays now, plus any game a member puts forward that week.
// When the week ends, a game with 2 or more "no" votes is out next week; every other game on the ballot is in.
import { q, q1 } from './db.js';
import { addDays, weekStart, openBallotWeek } from './dates.js';
import { gamesByIds } from './auth.js';
import { notify } from './notify.js';

export const NO_LIMIT = 2;       // this many "no" votes keep a game out

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
  return ids.filter((id) => games[id]).map((id) => {
    const v = votes.filter((x) => x.game_id === id);
    return {
      game: games[id],
      inNow: current.includes(id),
      nominatedBy: noms.find((n) => n.game_id === id && !current.includes(id))?.display_name ?? null,
      yes: v.filter((x) => x.vote).length,
      no: v.filter((x) => !x.vote).length,
      mine: userId ? (v.find((x) => x.user_id === userId)?.vote ?? null) : null,
    };
  }).sort((a, b) => (b.inNow - a.inNow) || a.game.name.localeCompare(b.game.name));
}

// Once a league's vote week has started (any time from that Monday on), set its games from the votes, once.
// Games voted out stop counting that Monday; games voted in count from that Monday.
export async function applyVote(leagueId, today) {
  const week = weekStart(today);
  const cast = await q1('select count(*)::int as n from game_votes where league_id = $1 and week = $2', [leagueId, week]);
  const nominated = await q1('select count(*)::int as n from vote_nominations where league_id = $1 and week = $2', [leagueId, week]);
  if (!cast.n && !nominated.n) return null;
  const claimed = await q('insert into vote_results (league_id, week) values ($1, $2) on conflict do nothing returning 1', [leagueId, week]);
  if (!claimed.length) return null;                                   // already applied

  const items = await ballot(leagueId, week);
  const outIds = items.filter((i) => i.no >= NO_LIMIT).map((i) => i.game.id);
  const inIds = items.filter((i) => i.no < NO_LIMIT).map((i) => i.game.id);
  const rows = await q('select game_id, added_on::text, removed_on::text from league_games where league_id = $1', [leagueId]);
  const have = Object.fromEntries(rows.map((r) => [r.game_id, r]));
  const added = [], removed = [];
  for (const id of inIds) {
    const r = have[id];
    if (!r) { await q('insert into league_games (league_id, game_id, added_on) values ($1, $2, $3)', [leagueId, id, week]); added.push(id); }
    else if (r.removed_on && r.removed_on <= week) {
      await q('update league_games set removed_on = null, added_on = $3 where league_id = $1 and game_id = $2', [leagueId, id, week]); added.push(id);
    } else if (r.removed_on) await q('update league_games set removed_on = null where league_id = $1 and game_id = $2', [leagueId, id]);
  }
  for (const id of outIds) {
    const r = have[id];
    if (r && countsOn(r, addDays(week, -1))) {
      await q('update league_games set removed_on = $3 where league_id = $1 and game_id = $2', [leagueId, id, week]); removed.push(id);
    }
  }
  // A league never ends up with no games: if every game was voted out, the vote keeps the least unpopular one.
  const left = await q(`select 1 from league_games where league_id = $1 and (removed_on is null or removed_on > $2)
                        and (added_on is null or added_on <= $2)`, [leagueId, week]);
  if (!left.length && removed.length) {
    const keep = items.filter((i) => outIds.includes(i.game.id)).sort((a, b) => a.no - b.no || b.yes - a.yes)[0];
    await q('update league_games set removed_on = null where league_id = $1 and game_id = $2', [leagueId, keep.game.id]);
    removed.splice(removed.indexOf(keep.game.id), 1);
  }

  const name = (id) => items.find((i) => i.game.id === id)?.game.name ?? id;
  const parts = [];
  if (added.length) parts.push(`In: ${added.map(name).join(', ')}`);
  if (removed.length) parts.push(`Out: ${removed.map(name).join(', ')}`);
  const body = `🗳️ The games vote is in. ${parts.length ? parts.join(' · ') : 'No changes: every game stays'} this week.`;
  const league = await q1('select name, owner_id from leagues where id = $1', [leagueId]);
  await q(`insert into league_messages (league_id, user_id, kind, body) values ($1, $2, 'notice', $3)`, [leagueId, league.owner_id, body]);
  const members = await q('select user_id from league_members where league_id = $1', [leagueId]);
  await notify(members.map((m) => m.user_id), { kind: 'request', link: `/leagues/${leagueId}`, body: `${league.name}: ${body.slice(3)}` });
  return { added, removed };
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
