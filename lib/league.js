import { q, q1 } from './db.js';
import { gamesByIds } from './auth.js';

// Everything needed to score a league: members, games and every counting result.
export async function loadLeague(id) {
  const league = await q1(
    `select id, name, code, owner_id, is_public, drop_worst, daily_cap,
       (created_at at time zone 'UTC')::date - 1 as start_date from leagues where id = $1`,
    [id]
  );
  if (!league) return null;
  const members = await q(
    `select u.id, u.username, u.display_name from league_members m join users u on u.id = m.user_id
     where m.league_id = $1 order by m.joined_at`,
    [id]
  );
  const gameRows = await q('select game_id, weight from league_games where league_id = $1', [id]);
  const gameIds = gameRows.map((r) => r.game_id);
  const weights = Object.fromEntries(gameRows.map((r) => [r.game_id, r.weight]));
  const games = await gamesByIds(gameIds);
  const scores = await q(
    `select id, user_id, game_id, play_date, score, puzzle_no, manual, flagged from scores
     where user_id = any($1) and game_id = any($2) and play_date >= $3
       and id not in (select score_id from league_exclusions where league_id = $4)`,
    [members.map((m) => m.id), Object.keys(games), league.start_date, id]
  );
  // Scoring options for this league: `all` for any period, `week` adds the dropped day.
  const all = { weights, dailyCap: league.daily_cap };
  const opts = { all, week: { ...all, dropWorst: league.drop_worst } };
  return { league, members, games, scores, weights, opts };
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
