import { q, q1 } from './db.js';
import { gamesByIds } from './auth.js';

// Everything needed to score a league: members, games and every counting result.
export async function loadLeague(id) {
  const league = await q1(
    `select id, name, code, owner_id, (created_at at time zone 'UTC')::date - 1 as start_date from leagues where id = $1`,
    [id]
  );
  if (!league) return null;
  const members = await q(
    `select u.id, u.username, u.display_name from league_members m join users u on u.id = m.user_id
     where m.league_id = $1 order by m.joined_at`,
    [id]
  );
  const gameIds = (await q('select game_id from league_games where league_id = $1', [id])).map((r) => r.game_id);
  const games = await gamesByIds(gameIds);
  const scores = await q(
    `select id, user_id, game_id, play_date, score, puzzle_no, manual, flagged from scores
     where user_id = any($1) and game_id = any($2) and play_date >= $3`,
    [members.map((m) => m.id), Object.keys(games), league.start_date]
  );
  return { league, members, games, scores };
}
