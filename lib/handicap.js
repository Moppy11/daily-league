// Handicap: players who have been behind get a head start, worked out every week from recent form (like golf).
// Kept free of the database so it can be tested.
//
// For the week starting `week`, each player's form is their average weekly points over their last (up to) 4 finished
// weeks in which they played. The league's form is the average of those. A player below it gets a head start of
// STRENGTH × the gap for the week, earned a seventh at a time on each day they post (so it can't be won by not
// playing). Players at or above the league's form get nothing: nobody loses points for being good.
export const FORM_WEEKS = 4;
export const STRENGTH = 0.75;    // closes most of the gap
export const CAP = 60;           // the most head start in a week

// totals: { [week]: { [userId]: points } } for finished weeks (only players who played that week).
// current: { [userId]: points } for the week in progress, already scaled to a full week. A new league, or a player
// with no finished week yet, is judged on that latest week instead.
// Returns { [userId]: weekly head start } for `week`.
export function weeklyHandicaps(totals, week, strength = STRENGTH, current = {}) {
  const past = Object.keys(totals).filter((w) => w < week).sort().reverse();
  const form = {};
  const seen = {};
  for (const w of past) {
    for (const [uid, pts] of Object.entries(totals[w])) {
      if ((seen[uid] ??= []).length < FORM_WEEKS) seen[uid].push(pts);
    }
  }
  for (const [uid, list] of Object.entries(seen)) form[uid] = list.reduce((a, b) => a + b, 0) / list.length;
  for (const [uid, pts] of Object.entries(current)) if (!(uid in form)) form[uid] = pts;
  const ids = Object.keys(form);
  if (ids.length < 2) return {};
  const league = ids.reduce((a, id) => a + form[id], 0) / ids.length;
  const out = {};
  for (const id of ids) {
    const h = Math.min(CAP, Math.round(strength * Math.max(0, league - form[id])));
    if (h > 0) out[id] = h;
  }
  return out;
}
