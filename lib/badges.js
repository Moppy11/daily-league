// Badges shown on a player's stats page, worked out from their results.
import { addDays } from './dates.js';
import { rankDay } from './points.js';

function longestRun(dates) {
  let best = 0, run = 0, prev = null;
  for (const d of [...new Set(dates)].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// Did this player win every game of a league on some day (at least two games, each against someone)?
function cleanSweep(userId, leagues) {
  for (const l of leagues) {
    const byDay = {};
    for (const s of l.scores) ((byDay[s.play_date] ??= {})[s.game_id] ??= []).push(s);
    for (const games of Object.values(byDay)) {
      const ids = Object.keys(games);
      if (ids.length < 2 || ids.length < Object.keys(l.games).length) continue;
      const swept = ids.every((gid) => games[gid].length > 1 && rankDay(games[gid], l.games[gid].higherBetter).get(userId)?.rank === 1);
      if (swept) return true;
    }
  }
  return false;
}

export const BADGES = [
  { id: 'streak7', emoji: '🔥', name: 'Week Warrior', desc: 'Post a result seven days in a row' },
  { id: 'streak30', emoji: '🌋', name: 'Unstoppable', desc: 'Post a result thirty days in a row' },
  { id: 'weekwin', emoji: '🏆', name: 'Week Winner', desc: 'Win a week in a league' },
  { id: 'weekwin5', emoji: '👑', name: 'Serial Winner', desc: 'Win five weeks' },
  { id: 'sweep', emoji: '🧹', name: 'Clean Sweep', desc: 'Win every game in a league on the same day' },
  { id: 'century', emoji: '💯', name: 'Century', desc: 'Post 100 results' },
  { id: 'allround', emoji: '🧩', name: 'All-rounder', desc: 'Play five different games' },
  { id: 'krill700', emoji: '🌟', name: 'One in a Krillion', desc: 'Score a perfect 700 on Krillion' },
  { id: 'krill450', emoji: '🦐', name: 'Trench Dweller', desc: 'Score 450 or more on Krillion' },
  { id: 'wordle2', emoji: '🟩', name: 'Mind Reader', desc: 'Solve Wordle in two guesses or fewer' },
  { id: 'holes5', emoji: '⛳', name: 'Sniper', desc: 'Finish Daily Holes five under par or better' },
  { id: 'fermi2', emoji: '🧪', name: 'Napkin Maths', desc: 'Score 2× or better on Fermi' },
];

// scores: this player's results; leagues: loadLeague() data for their leagues; weekWins: total weeks won.
export function earnedBadges(userId, scores, leagues, weekWins) {
  const run = longestRun(scores.map((s) => s.play_date));
  const has = (game, test) => scores.some((s) => s.game_id === game && test(s.score));
  const earned = {
    streak7: run >= 7, streak30: run >= 30,
    weekwin: weekWins >= 1, weekwin5: weekWins >= 5,
    sweep: cleanSweep(userId, leagues),
    century: scores.length >= 100,
    allround: new Set(scores.map((s) => s.game_id)).size >= 5,
    krill700: has('krillion', (v) => v >= 700), krill450: has('krillion', (v) => v >= 450),
    wordle2: has('wordle', (v) => v <= 2), holes5: has('dailyholes', (v) => v <= -5), fermi2: has('fermi', (v) => v <= 2),
  };
  return BADGES.map((b) => ({ ...b, earned: !!earned[b.id] }));
}
