import Link from 'next/link';
import { formatScore } from '@/lib/games';
import { prettyDate, weekLabel } from '@/lib/dates';
import { bestWorstLabels } from '@/lib/records';
import { dismissRecap } from './actions';
import { Medal } from './ui';

const names = (r) => (r.users.length > 3 ? `${r.users.length} players` : r.users.map((u) => u.display_name).join(' & '));

// Last week's recap for one league: the winner, the final table, and game by game who won most,
// the best and the worst result. `dismiss` shows the "Got it" button that hides it until next week.
export default function WeeklyRecap({ recap, league, me, dismiss = false, showLink = false }) {
  const { week, table, winners, perGame } = recap;
  const myRow = table.findIndex((r) => r.user.id === me);
  let pos = 0;
  const rows = table.map((r, i) => {
    if (i === 0 || r.total !== table[i - 1].total) pos = i + 1;
    return { ...r, pos };
  });
  return (
    <section className="card recap">
      <div className="recap-head">
        <div>
          <p className="muted small">Weekly recap · {league.name}</p>
          <h2>Week of {weekLabel(week)}</h2>
        </div>
        {dismiss && (
          <form action={dismissRecap}>
            <input type="hidden" name="league" value={league.id} />
            <input type="hidden" name="week" value={week} />
            <button className="btn small" aria-label="Close the weekly recap">Got it</button>
          </form>
        )}
      </div>

      {winners.length > 0 && (
        <div className="recap-winner">
          <span className="trophy">🏆</span>
          <div>
            <b>{winners.map((u) => (u.id === me ? 'You' : u.display_name)).join(' & ')}</b>
            {winners.length > 1 ? ' shared the week' : winners[0].id === me ? ' won the week!' : ' won the week'}
            <div className="muted small">{table[0].total} pts{table[0].wins ? ` · ${table[0].wins} game win${table[0].wins === 1 ? '' : 's'}` : ''}</div>
          </div>
        </div>
      )}
      {myRow > 0 && <p className="small">You finished <b>{ordinal(rows[myRow].pos)}</b> with {rows[myRow].total} pts.</p>}
      {myRow === -1 && <p className="small muted">You didn&apos;t post last week. New week, fresh start.</p>}

      <h3>Final table</h3>
      <div className="table-wrap">
        <table className="recap-table">
          <thead><tr><th>Position</th><th className="left">Player</th><th>Played</th><th>Wins</th><th>Points</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user.id} className={r.user.id === me ? 'me' : ''}>
                <td><Medal pos={r.pos} /></td>
                <td className="left name">{r.user.display_name}</td>
                <td>{r.played}</td>
                <td>{r.wins}</td>
                <td className="pts-cell">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Game by game</h3>
      <div className="grid recap-games">
        {perGame.map((g) => {
          const [bestLabel, worstLabel] = bestWorstLabels(g.game);
          return (
            <div className="recap-game" key={g.game.id}>
              <b>{g.game.emoji} {g.game.name}</b>
              <dl>
                {g.wins && <><dt>Most days won</dt><dd><b>{g.wins.value}</b> {names(g.wins)}</dd></>}
                {g.best && <><dt>{bestLabel}</dt><dd><b>{formatScore(g.game, g.best.value)}</b> {names(g.best)} <small className="muted">{prettyDate(g.best.extra)}</small></dd></>}
                {g.worst && <><dt>{worstLabel}</dt><dd><b>{formatScore(g.game, g.worst.value)}</b> {names(g.worst)} <small className="muted">{prettyDate(g.worst.extra)}</small></dd></>}
              </dl>
            </div>
          );
        })}
      </div>
      {showLink && <p className="small"><Link href={`/leagues/${league.id}`}>Open {league.name} →</Link></p>}
    </section>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
