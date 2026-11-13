// A duel is one game, two players, seven days. Each day both post, the better result takes the day.
import { addDays } from './dates.js';

export function duelScore(duel, game, scores) {
  const end = addDays(duel.week_start, 6);
  const mine = {}, theirs = {};
  for (const s of scores) {
    if (s.game_id !== duel.game_id || s.play_date < duel.week_start || s.play_date > end) continue;
    if (s.user_id === duel.challenger_id) mine[s.play_date] = s.score;
    if (s.user_id === duel.opponent_id) theirs[s.play_date] = s.score;
  }
  let a = 0, b = 0, played = 0;
  for (const date of Object.keys(mine)) {
    if (!(date in theirs)) continue;
    played++;
    if (mine[date] === theirs[date]) continue;
    if (game.higherBetter ? mine[date] > theirs[date] : mine[date] < theirs[date]) a++; else b++;
  }
  return { challenger: a, opponent: b, played, end };
}
