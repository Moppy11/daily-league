// Handicap: the further ahead of last place you usually finish, the further behind you start the week.
// Kept free of the database so it can be tested.
//
// For each finished week, a player's lead is their points minus the last-placed player's points that week. Their
// form is their average lead over their last FORM_WEEKS weeks played (fewer in a new league), so one good or bad
// week doesn't decide it. Each player starts the new week at minus STRENGTH × (their form − the lowest form in the
// league): whoever is usually last starts at 0 and everyone else starts behind them.
export const STRENGTH = 0.75;
export const FORM_WEEKS = 4;

// history: { [week]: { [userId]: points } } for finished weeks (players who played that week).
// Returns { starts: { [userId]: starting score (negative, omitted when 0) }, form: { [userId]: { lead, weeks } } }
// for the week starting `week`, using only the weeks before it.
export function weeklyStarts(history, week, strength = STRENGTH) {
  const leads = {};
  for (const w of Object.keys(history).filter((x) => x < week).sort().reverse()) {
    const ids = Object.keys(history[w]);
    if (ids.length < 2) continue;                      // nobody to be ahead of
    const last = Math.min(...ids.map((id) => history[w][id]));
    for (const id of ids) if ((leads[id] ??= []).length < FORM_WEEKS) leads[id].push(history[w][id] - last);
  }
  const form = Object.fromEntries(Object.entries(leads).map(([id, l]) => [id, { lead: l.reduce((a, b) => a + b, 0) / l.length, weeks: l.length }]));
  const ids = Object.keys(form);
  const starts = {};
  if (ids.length < 2) return { starts, form };
  const base = Math.min(...ids.map((id) => form[id].lead));
  for (const id of ids) {
    const s = -Math.round(strength * (form[id].lead - base));
    if (s < 0) starts[id] = s;
  }
  return { starts, form };
}
