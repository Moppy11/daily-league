// Weekly winners and all-time league records, worked out from a league's results.
import { rankDay, standings } from './points.js';
import { addDays, weekStart } from './dates.js';

const inWeek = (s, week) => s.play_date >= week && s.play_date <= addDays(week, 6);

// Finished weeks only (before `thisWeek`), newest first: [{ week, winners: [user], total }].
// Players level on points at the top share the week.
export function weeklyWinners(scores, games, members, thisWeek) {
  const weeks = [...new Set(scores.map((s) => weekStart(s.play_date)))].filter((w) => w < thisWeek).sort().reverse();
  const out = [];
  for (const week of weeks) {
    const table = standings(scores.filter((s) => inWeek(s, week)), games, members);
    const top = table[0]?.total ?? 0;
    if (top > 0) out.push({ week, total: top, winners: table.filter((r) => r.total === top).map((r) => r.user) });
  }
  return out;
}

// user id -> number of weeks won
export function weeklyWinCounts(winners) {
  const counts = {};
  for (const w of winners) for (const u of w.winners) counts[u.id] = (counts[u.id] ?? 0) + 1;
  return counts;
}

function longestRun(dates) {
  let best = 0, run = 0, prev = null;
  for (const d of [...new Set(dates)].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// The holder(s) of the best value: [{ user, value, extra }] -> { users, value, extra } or null.
function top(entries, higherBetter = true) {
  const valid = entries.filter((e) => e.value !== null && e.value !== undefined);
  if (!valid.length) return null;
  const best = valid.reduce((a, b) => ((higherBetter ? b.value > a.value : b.value < a.value) ? b : a)).value;
  const holders = valid.filter((e) => e.value === best);
  return { users: [...new Map(holders.map((h) => [h.user.id, h.user])).values()], value: best, extra: holders[0].extra };
}

// All-time records for a league. Scores and games as loaded by loadLeague.
export function leagueRecords(scores, games, members, thisWeek) {
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const mine = scores.filter((s) => byId[s.user_id] && games[s.game_id]);
  const of = (userId) => mine.filter((s) => s.user_id === userId);

  // Points for each player on each day, and in each week.
  const dayPts = {}, weekPts = {};
  const groups = {};
  for (const s of mine) (groups[s.game_id + '|' + s.play_date] ??= []).push(s);
  for (const [key, entries] of Object.entries(groups)) {
    const [gameId, date] = key.split('|');
    for (const [userId, { points }] of rankDay(entries, games[gameId].higherBetter)) {
      dayPts[userId + '|' + date] = (dayPts[userId + '|' + date] ?? 0) + points;
      const wk = userId + '|' + weekStart(date);
      weekPts[wk] = (weekPts[wk] ?? 0) + points;
    }
  }
  const split = (obj) => Object.entries(obj).map(([k, value]) => ({ user: byId[k.split('|')[0]], value, extra: k.split('|')[1] }));
  const table = standings(mine, games, members);
  const wins = weeklyWinCounts(weeklyWinners(mine, games, members, thisWeek));

  const league = {
    bestWeek: top(split(weekPts)),
    bestDay: top(split(dayPts)),
    weeklyWins: top(members.map((m) => ({ user: m, value: wins[m.id] ?? null }))),
    streak: top(members.map((m) => ({ user: m, value: longestRun(of(m.id).map((s) => s.play_date)) || null }))),
    posted: top(members.map((m) => ({ user: m, value: of(m.id).length || null }))),
  };

  const perGame = Object.values(games).sort((a, b) => a.name.localeCompare(b.name)).map((game) => {
    const rows = mine.filter((s) => s.game_id === game.id);
    if (!rows.length) return null;
    const user = (id) => rows.filter((s) => s.user_id === id);
    return {
      game,
      best: top(rows.map((s) => ({ user: byId[s.user_id], value: s.score, extra: s.play_date })), game.higherBetter),
      average: top(members.map((m) => {
        const r = user(m.id);
        return { user: m, value: r.length >= 5 ? r.reduce((a, s) => a + s.score, 0) / r.length : null };
      }), game.higherBetter),
      wins: top(table.map((r) => ({ user: r.user, value: r.byGame[game.id]?.wins || null }))),
      streak: top(members.map((m) => ({ user: m, value: longestRun(user(m.id).map((s) => s.play_date)) || null }))),
    };
  }).filter(Boolean);

  return { league, perGame };
}
