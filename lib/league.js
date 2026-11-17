import { q, q1 } from './db.js';
import { gamesByIds, userToday } from './auth.js';

// Everything needed to score a league: members, games and every counting result.
// Games are added and removed from the next day on, so a day already played keeps its games:
//   games      every game with results that count (including ones being removed), for the tables
//   liveGames  the games that count today, for the boards and the play list
//   plan       { gameId: { added_on, removed_on } } for the settings form
export async function loadLeague(id, today = null) {
  const league = await q1(
    `select id, name, code, owner_id, is_public, drop_worst, daily_cap,
       (created_at at time zone 'UTC')::date - 1 as start_date from leagues where id = $1`,
    [id]
  );
  if (!league) return null;
  const members = await q(
    `select u.id, u.username, u.display_name, coalesce(m.joined_on, (m.joined_at at time zone 'UTC')::date)::text as joined_on from league_members m join users u on u.id = m.user_id
     where m.league_id = $1 order by m.joined_at`,
    [id]
  );
  const gameRows = await q('select game_id, weight, added_on::text, removed_on::text from league_games where league_id = $1', [id]);
  const gameIds = gameRows.map((r) => r.game_id);
  const weights = Object.fromEntries(gameRows.map((r) => [r.game_id, r.weight]));
  const games = await gamesByIds(gameIds);
  // A result counts in this league from the day its player joined, so earlier days don't carry over
  // from other leagues. Results from the joining day itself count: each game can only be posted once
  // a day, so a result posted that morning must still be able to count. Profiles keep everything.
  const scores = await q(
    `select s.id, s.user_id, s.game_id, s.play_date, s.score, s.puzzle_no, s.manual, s.flagged, (s.raw is not null) as pasted
     from scores s join league_members m on m.user_id = s.user_id and m.league_id = $3
     join league_games lg on lg.league_id = $3 and lg.game_id = s.game_id
       and s.play_date >= coalesce(lg.added_on, '-infinity'::date) and s.play_date < coalesce(lg.removed_on, 'infinity'::date)
     where s.game_id = any($1) and s.play_date >= coalesce(m.joined_on, (m.joined_at at time zone 'UTC')::date) and s.play_date >= $2
       and s.id not in (select score_id from league_exclusions where league_id = $3)
       and not exists (select 1 from league_penalties p where p.league_id = $3 and p.kind = 'ban'
                       and p.user_id = s.user_id and p.game_id = s.game_id and p.on_date = s.play_date)`,
    [Object.keys(games), league.start_date, id]
  );
  // Scoring options for this league: `all` for any period, `week` adds the dropped day.
  const penalties = await q(
    `select p.id, p.user_id, p.game_id, p.kind, p.on_date::text as on_date, p.points, p.reason, u.display_name
     from league_penalties p join users u on u.id = p.user_id where p.league_id = $1 order by p.id desc`, [id]);
  const deductions = penalties.filter((p) => p.kind === 'points').map((p) => ({ user_id: p.user_id, date: p.on_date, points: p.points }));
  const all = { weights, dailyCap: league.daily_cap, deductions };
  const opts = { all, week: { ...all, dropWorst: league.drop_worst } };
  const day = today ?? (await userToday());
  const plan = Object.fromEntries(gameRows.map((r) => [r.game_id, { added_on: r.added_on, removed_on: r.removed_on }]));
  const liveGames = Object.fromEntries(Object.entries(games).filter(([gid]) => {
    const p = plan[gid];
    return (!p.added_on || p.added_on <= day) && (!p.removed_on || p.removed_on > day);
  }));
  return { league, members, games, liveGames, plan, scores, weights, opts, penalties };
}

// Post last week's recap in the league chat the first time anyone opens the league in a new week.
export async function ensureRecap(data, thisWeek) {
  const { weeklyRecap } = await import('./records.js');
  const { addDays, weekLabel } = await import('./dates.js');
  const { notify } = await import('./notify.js');
  const last = addDays(thisWeek, -7);
  if (!data.scores.some((s) => s.play_date >= last && s.play_date < thisWeek)) return;
  if (await q1(`select 1 from league_messages where league_id = $1 and kind = 'recap' and game_id = $2`, [data.league.id, last])) return;
  const body = weeklyRecap(data.scores, data.games, data.members, last, data.opts);
  if (!body) return;
  // The unique index makes sure two people opening the page at once still post one recap.
  const added = await q(
    `insert into league_messages (league_id, user_id, kind, game_id, body) values ($1, $2, 'recap', $3, $4)
     on conflict do nothing returning id`,
    [data.league.id, data.league.owner_id, last, `Week of ${weekLabel(last)}\n${body}`]
  );
  if (added.length) {
    await notify(data.members.map((m) => m.id), {
      kind: 'chat', link: `/leagues/${data.league.id}/chat`, body: `Weekly recap for ${data.league.name} is in the chat`, once: true,
    });
  }
}

// Schedule a league's games from tomorrow on: `wanted` is the full list the admin picked. Games already
// counting today keep counting until midnight; new ones start tomorrow. Returns { added, removed } names.
export async function scheduleLeagueGames(id, wanted, weights, today) {
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
  const rows = await q('select game_id, added_on::text, removed_on::text from league_games where league_id = $1', [id]);
  const have = Object.fromEntries(rows.map((r) => [r.game_id, r]));
  const added = [], removed = [];
  for (const gid of wanted) {
    const r = have[gid], w = weights[gid] ?? 1;
    if (!r) {
      await q('insert into league_games (league_id, game_id, weight, added_on) values ($1, $2, $3, $4)', [id, gid, w, tomorrow]);
      added.push(gid);
    } else if (r.removed_on && r.removed_on <= today) {
      // Removed before today: it comes back from tomorrow, without the days it was out.
      await q('update league_games set removed_on = null, added_on = $3, weight = $4 where league_id = $1 and game_id = $2', [id, gid, tomorrow, w]);
      added.push(gid);
    } else {
      // Still counting (or only due to stop tonight): keep it, cancel any removal.
      await q('update league_games set removed_on = null, weight = $3 where league_id = $1 and game_id = $2', [id, gid, w]);
    }
  }
  for (const r of rows) {
    if (wanted.includes(r.game_id) || (r.removed_on && r.removed_on <= tomorrow)) continue;
    if (r.added_on && r.added_on > today) {
      await q('delete from league_games where league_id = $1 and game_id = $2', [id, r.game_id]);   // never started
    } else {
      await q('update league_games set removed_on = $3 where league_id = $1 and game_id = $2', [id, r.game_id, tomorrow]);
      removed.push(r.game_id);
    }
  }
  return { added, removed };
}

// SQL condition for "this league_games row has not been removed" (alias g).
export const NOT_REMOVED = '(g.removed_on is null or g.removed_on > current_date)';
