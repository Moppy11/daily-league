import { notFound } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { requireUser, userToday, gamesByIds, canSee } from '@/lib/auth';
import { formatScore, formatAvg } from '@/lib/games';
import { addDays, prettyDate } from '@/lib/dates';

function streaks(dates, today) {
  const set = new Set(dates);
  let current = 0;
  for (let d = set.has(today) ? today : addDays(today, -1); set.has(d); d = addDays(d, -1)) current++;
  let longest = 0, run = 0, prev = null;
  for (const d of [...set].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

// Recent scores as a small line; the good direction always points up.
function Spark({ values, higherBetter }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => {
    const t = (v - min) / span;
    const y = 4 + (higherBetter ? 1 - t : t) * 24;
    return `${(i / (values.length - 1)) * 100},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Recent form, higher is better">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default async function Profile({ params }) {
  const { username } = await params;
  const viewer = await requireUser(`/u/${username}`);
  const person = await q1('select id, username, display_name, created_at from users where username = $1', [username.toLowerCase()]);
  if (!person) notFound();
  const self = person.id === viewer.id;
  if (!(await canSee(viewer.id, person.id))) {
    return <section className="card narrow"><h1>{person.display_name}</h1><p>Add @{person.username} as a friend or share a league to see their stats.</p></section>;
  }

  const today = await userToday();
  const scores = await q('select game_id, play_date, score, manual from scores where user_id = $1 order by play_date', [person.id]);
  const games = await gamesByIds(scores.map((s) => s.game_id));
  const all = streaks(scores.map((s) => s.play_date), today);

  const perGame = Object.values(games).map((g) => {
    const rows = scores.filter((s) => s.game_id === g.id);
    const vals = rows.map((r) => r.score);
    const solved = g.type === 'guesses' ? vals.filter((v) => v <= g.max).length : null;
    return {
      game: g, played: rows.length,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      best: g.higherBetter ? Math.max(...vals) : Math.min(...vals),
      solved, recent: vals.slice(-30), last7: vals.slice(-7),
      ...streaks(rows.map((r) => r.play_date), today),
    };
  }).sort((a, b) => b.played - a.played);

  // Head-to-head on days you both played the same game.
  let h2h = null;
  if (!self) {
    const mine = await q('select game_id, play_date, score from scores where user_id = $1', [viewer.id]);
    const theirs = new Map(scores.map((s) => [s.game_id + '|' + s.play_date, s.score]));
    const rows = {};
    for (const m of mine) {
      const t = theirs.get(m.game_id + '|' + m.play_date);
      const g = games[m.game_id];
      if (t === undefined || !g) continue;
      const r = (rows[g.id] ??= { game: g, won: 0, lost: 0, tied: 0 });
      if (m.score === t) r.tied++;
      else if (g.higherBetter ? m.score > t : m.score < t) r.won++;
      else r.lost++;
    }
    h2h = Object.values(rows);
  }

  const history = scores.slice(-30).reverse();

  return (
    <>
      <div className="headline">
        <div>
          <h1>{person.display_name}</h1>
          <p className="muted">@{person.username}</p>
        </div>
        <div className="streak">🔥 {all.current}<small>day streak</small></div>
      </div>
      <div className="stats">
        <div><b>{scores.length}</b><small>results posted</small></div>
        <div><b>{new Set(scores.map((s) => s.play_date)).size}</b><small>days played</small></div>
        <div><b>{all.longest}</b><small>longest streak</small></div>
      </div>

      {h2h && (
        <>
          <h2>You vs {person.display_name}</h2>
          {h2h.length === 0 && <p className="muted">No days yet where you both played the same game.</p>}
          <div className="list">
            {h2h.map((r) => (
              <div className="card list-row" key={r.game.id}>
                <span className="emoji">{r.game.emoji}</span>
                <span className="grow"><b>{r.game.name}</b><small className="muted">{r.won + r.lost + r.tied} shared day{r.won + r.lost + r.tied === 1 ? "" : "s"}</small></span>
                <span className="h2h"><b>{r.won}</b> W · {r.tied} T · <b>{r.lost}</b> L</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>By game</h2>
      {perGame.length === 0 && <p className="muted">{self ? 'Post your first score to start building stats.' : 'No results yet.'}</p>}
      <div className="grid">
        {perGame.map((s) => (
          <div className="card" key={s.game.id}>
            <div className="game-head">
              <span className="emoji">{s.game.emoji}</span><b>{s.game.name}</b>
              <span className="muted small">{s.game.higherBetter ? 'higher is better' : 'lower is better'}</span>
            </div>
            <div className="stats tight">
              <div><b>{formatAvg(s.game, s.avg)}</b><small>average</small></div>
              <div><b>{formatScore(s.game, s.best)}</b><small>best</small></div>
              <div><b>{s.played}</b><small>played</small></div>
              <div><b>{formatAvg(s.game, s.last7.reduce((a, b) => a + b, 0) / s.last7.length)}</b><small>last 7 avg</small></div>
              <div><b>{s.current}</b><small>streak</small></div>
              <div><b>{s.longest}</b><small>best streak</small></div>
              {s.solved !== null && <div><b>{Math.round((s.solved / s.played) * 100)}%</b><small>solved</small></div>}
            </div>
            <Spark values={s.recent} higherBetter={s.game.higherBetter} />
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <>
          <h2>Recent results</h2>
          <div className="card table-wrap">
            <table>
              <thead><tr><th className="left">Date</th><th className="left">Game</th><th>Score</th></tr></thead>
              <tbody>
                {history.map((s, i) => (
                  <tr key={i}>
                    <td className="left">{prettyDate(s.play_date)}</td>
                    <td className="left">{games[s.game_id]?.emoji} {games[s.game_id]?.name}</td>
                    <td>{formatScore(games[s.game_id], s.score)}{s.manual ? ' ✍️' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
