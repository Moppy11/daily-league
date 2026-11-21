// Handicap: the more points a day you usually score compared with whoever usually scores least, the further behind
// you start the week. Kept free of the database so it can be tested.
//
// Form is a player's average points per day played over the last FORM_DAYS days before the week (at least MIN_DAYS
// days played to count), so a handicap is ready after a few days, and one good or bad day or week doesn't decide it.
// Each player starts the week at minus STRENGTH × 7 × (their daily average − the lowest daily average): whoever
// usually scores least starts at 0 and everyone else starts behind them. Worked out once a week, on Monday.
import { addDays } from './dates.js';

export const STRENGTH = 0.75;
export const FORM_DAYS = 28;
export const MIN_DAYS = 2;

// days: { [date]: { [userId]: points that day } } (players who played that day). Returns
// { starts: { [userId]: starting score (negative, omitted when 0) }, form: { [userId]: { perDay, days } } }
// for the week starting `week`, using only the FORM_DAYS days before it.
export function weeklyStarts(days, week, strength = STRENGTH) {
  const from = addDays(week, -FORM_DAYS);
  const pts = {};
  for (const [d, byUser] of Object.entries(days)) {
    if (d < from || d >= week) continue;
    for (const [id, p] of Object.entries(byUser)) (pts[id] ??= []).push(p);
  }
  const form = {};
  for (const [id, list] of Object.entries(pts)) {
    if (list.length >= MIN_DAYS) form[id] = { perDay: list.reduce((a, b) => a + b, 0) / list.length, days: list.length };
  }
  const ids = Object.keys(form);
  const starts = {};
  if (ids.length < 2) return { starts, form };
  const base = Math.min(...ids.map((id) => form[id].perDay));
  for (const id of ids) {
    const s = -Math.round(strength * 7 * (form[id].perDay - base));
    if (s < 0) starts[id] = s;
  }
  return { starts, form };
}
