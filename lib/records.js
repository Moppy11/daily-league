// Weekly winners and all-time league records, worked out from a league's results.
import { standings } from './points.js';
import { addDays, weekStart } from './dates.js';

const inWeek = (s, week) => s.play_date >= week && s.play_date <= addDays(week, 6);

// Finished weeks only (before `thisWeek`), newest first: [{ week, winners: [user], total }].
// Players level on points at the top share the week.
export function weeklyWinners(scores, games, members, thisWeek, opts = {}) {
  const weeks = [...new Set(scores.map((s) => weekStart(s.play_date)))].filter((w) => w < thisWeek).sort().reverse();
  const out = [];
  for (const week of weeks) {
    const table = standings(scores.filter((s) => inWeek(s, week)), games, members, opts);
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
export function leagueRecords(scores, games, members, thisWeek, opts = {}) {
  const { week: weekOpts = {}, all: allOpts = {} } = opts;
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const mine = scores.filter((s) => byId[s.user_id] && games[s.game_id]);
  const of = (userId) => mine.filter((s) => s.user_id === userId);

  // Points for each player on each day and in each week, scored the same way as the tables.
  const dayPts = {}, weekPts = {};
  for (const date of new Set(mine.map((s) => s.play_date))) {
    for (const r of standings(mine.filter((s) => s.play_date === date), games, members, allOpts)) if (r.played) dayPts[r.user.id + '|' + date] = r.total;
  }
  for (const week of new Set(mine.map((s) => weekStart(s.play_date)))) {
    for (const r of standings(mine.filter((s) => inWeek(s, week)), games, members, weekOpts)) if (r.played) weekPts[r.user.id + '|' + week] = r.total;
  }
  const split = (obj) => Object.entries(obj).map(([k, value]) => ({ user: byId[k.split('|')[0]], value, extra: k.split('|')[1] }));
  const table = standings(mine, games, members, allOpts);
  const wins = weeklyWinCounts(weeklyWinners(mine, games, members, thisWeek, weekOpts));

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

// A short written summary of a finished week, for the league chat. Returns null if nobody scored.
export function weeklyRecap(scores, games, members, week, opts = {}) {
  const table = standings(scores.filter((s) => inWeek(s, week)), games, members, opts.week).filter((r) => r.played);
  if (!table.length || table[0].total === 0) return null;
  const top = table[0].total;
  const winners = table.filter((r) => r.total === top);
  const name = (r) => r.user.display_name;
  const lines = [`🏆 Winner: ${winners.map(name).join(' & ')} with ${top} pts`];
  const second = table.find((r) => r.total < top);
  if (second) lines.push(`🤏 Winning margin: ${top - second.total} pt${top - second.total === 1 ? '' : 's'} over ${name(second)}`);

  // Biggest climber compared with the week before.
  const before = standings(scores.filter((s) => inWeek(s, addDays(week, -7))), games, members, opts.week).filter((r) => r.played);
  const was = Object.fromEntries(before.map((r, i) => [r.user.id, i + 1]));
  const climbs = table.map((r, i) => ({ r, up: was[r.user.id] ? was[r.user.id] - (i + 1) : 0 })).sort((a, b) => b.up - a.up);
  if (climbs[0]?.up > 0) lines.push(`📈 Biggest climber: ${name(climbs[0].r)}, up ${climbs[0].up} place${climbs[0].up === 1 ? '' : 's'}`);

  const dayWins = [...table].sort((a, b) => b.wins - a.wins)[0];
  if (dayWins.wins > 0) lines.push(`🎯 Most game wins: ${name(dayWins)} (${dayWins.wins})`);
  const busiest = [...table].sort((a, b) => b.played - a.played)[0];
  lines.push(`📋 Most results posted: ${name(busiest)} (${busiest.played})`);
  return lines.join('\n');
}
