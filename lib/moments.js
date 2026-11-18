// Pop-up moments: a personal best or worst for the player who just posted, and league records broken
// (the league's best or worst ever result in a game), shown to everyone in that league the next time they open
// the site. A worst-ever record can be laughed at; its holder is told about every laugh.
import { q, q1 } from './db.js';
import { formatScore } from './games.js';
import { prettyDate } from './dates.js';
import { loadLeague } from './league.js';

// Enough history that a "best" or "worst" means something.
export const PERSONAL_MIN = 3;   // earlier results of yours in that game
export const LEAGUE_MIN = 5;     // earlier results in that league for that game

const better = (game, a, b) => (game.higherBetter ? a > b : a < b);

// Called once a result is saved. `today` is the player's day (league games follow it).
export async function checkMoments(user, game, scoreId, score, date, today) {
  // ---- personal best / worst, for the poster only ----
  const mine = (await q('select score from scores where user_id = $1 and game_id = $2 and id <> $3', [user.id, game.id, scoreId]))
    .map((r) => Number(r.score));
  if (mine.length >= PERSONAL_MIN) {
    const shown = formatScore(game, score);
    if (mine.every((s) => better(game, score, s))) {
      await addMoment(user.id, 'pb', `🎉 New personal best! ${shown} on ${game.name}. Well done, you absolute legend.`);
    } else if (mine.every((s) => better(game, s, score))) {
      await addMoment(user.id, 'pw', `💀 Booo, you suck! ${shown} is your worst ${game.name} ever.`);
    }
  }

  // ---- league records, for everyone in each league where this result counts ----
  const leagues = await q('select league_id from league_members where user_id = $1', [user.id]);
  for (const { league_id } of leagues) {
    const data = await loadLeague(league_id, today);
    if (!data?.games[game.id] || !data.scores.some((s) => s.id === scoreId)) continue;   // doesn't count here
    const earlier = data.scores.filter((s) => s.game_id === game.id && s.id !== scoreId).map((s) => ({ ...s, score: Number(s.score) }));
    if (earlier.length < LEAGUE_MIN) continue;
    const top = earlier.reduce((a, b) => (better(game, b.score, a.score) ? b : a));
    const bottom = earlier.reduce((a, b) => (better(game, a.score, b.score) ? b : a));
    const kind = better(game, score, top.score) ? 'best' : better(game, bottom.score, score) ? 'worst' : null;
    if (!kind) continue;
    const prev = kind === 'best' ? top : bottom;
    const prevName = data.members.find((m) => m.id === prev.user_id)?.display_name ?? 'someone';
    const ev = await q1(
      `insert into record_events (league_id, user_id, game_id, score_id, kind, score, prev_score, prev_name, play_date)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing returning id`,
      [league_id, user.id, game.id, scoreId, kind, score, prev.score, prevName, date]
    );
    if (!ev) continue;
    const shown = formatScore(game, score), was = formatScore(game, prev.score);
    for (const m of data.members) {
      const who = m.id === user.id ? 'You' : user.display_name;
      const body = kind === 'best'
        ? `🏆 League record in ${data.league.name}! ${who} scored ${shown} on ${game.name}, the best ever. The old record was ${was} by ${prevName}.`
        : `🤡 New all-time low in ${data.league.name}. ${who} scored ${shown} on ${game.name}, the worst ever. The old low was ${was} by ${prevName}.`;
      await addMoment(m.id, 'record', body, ev.id);
    }
  }
}

async function addMoment(userId, kind, body, eventId = null) {
  await q('insert into moments (user_id, kind, body, event_id) values ($1, $2, $3, $4)', [userId, kind, body, eventId]);
}

// The pop-ups still to show this player, oldest first.
export async function unseenMoments(userId) {
  return q(
    `select mo.id, mo.kind, mo.body, mo.event_id, e.kind as record_kind, e.user_id as holder_id,
       (select count(*)::int from record_laughs l where l.event_id = mo.event_id) as laughs,
       exists (select 1 from record_laughs l where l.event_id = mo.event_id and l.user_id = $1) as laughed
     from moments mo left join record_events e on e.id = mo.event_id
     where mo.user_id = $1 and mo.seen_at is null order by mo.id limit 5`,
    [userId]
  );
}

// Recent records for a league page, with laughs on the lows.
export async function recentRecords(leagueId, userId, limit = 6) {
  return q(
    `select e.id, e.kind, e.game_id, e.score, e.prev_score, e.prev_name, e.play_date::text as play_date, e.user_id, u.display_name,
       (select count(*)::int from record_laughs l where l.event_id = e.id) as laughs,
       exists (select 1 from record_laughs l where l.event_id = e.id and l.user_id = $2) as laughed
     from record_events e join users u on u.id = e.user_id where e.league_id = $1 order by e.id desc limit $3`,
    [leagueId, userId, limit]
  );
}

export const recordLine = (game, e) =>
  `${e.kind === 'best' ? '🏆 Best ever' : '🤡 Worst ever'}: ${formatScore(game, Number(e.score))} by ${e.display_name}, ${prettyDate(e.play_date)}`;
