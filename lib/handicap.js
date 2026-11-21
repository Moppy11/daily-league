// Handicap: the further ahead you finished last week, the further behind you start this week.
// Kept free of the database so it can be tested.
//
// Each player who played last week starts this week at minus STRENGTH × (their points − the last-placed player's
// points), rounded. Whoever came last starts at 0, so everyone else starts behind them. Players who didn't play
// last week start at 0. The starting score counts in full from Monday, whether or not they play.
export const STRENGTH = 0.75;

// prev: { [userId]: points } from last week's real table (players who played). Returns { [userId]: starting score }
// (0 or negative), leaving out players who start at 0.
export function weeklyStarts(prev, strength = STRENGTH) {
  const ids = Object.keys(prev);
  if (ids.length < 2) return {};
  const last = Math.min(...ids.map((id) => prev[id]));
  const out = {};
  for (const id of ids) {
    const s = -Math.round(strength * (prev[id] - last));
    if (s < 0) out[id] = s;
  }
  return out;
}
