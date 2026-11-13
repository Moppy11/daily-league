import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser, userToday } from '@/lib/auth';
import { GAMES, builtin, formatScore } from '@/lib/games';
import { prettyDate } from '@/lib/dates';
import { Medal } from '../ui';

// Everyone's results for one game, limited to players who made their stats public.
export default async function Global({ searchParams }) {
  const sp = await searchParams;
  const user = await requireUser('/global');
  const today = await userToday();
  const game = builtin(sp.game) ?? GAMES[0];
  const dir = game.higherBetter ? 'desc' : 'asc';
  const visible = `(u.stats_visibility = 'public' or u.id = $2)`;
  const [day, best] = await Promise.all([
    q(`select u.id, u.username, u.display_name, s.score from scores s join users u on u.id = s.user_id
       where s.game_id = $1 and s.play_date = $3 and not s.manual and ${visible} order by s.score ${dir}, s.created_at limit 25`, [game.id, user.id, today]),
    q(`select u.id, u.username, u.display_name, s.score, s.play_date from scores s join users u on u.id = s.user_id
       where s.game_id = $1 and not s.manual and ${visible} order by s.score ${dir}, s.play_date limit 10`, [game.id, user.id]),
  ]);
  let rank = 0;
  const ranked = day.map((r, i) => { if (i === 0 || r.score !== day[i - 1].score) rank = i + 1; return { ...r, rank }; });

  return (
    <>
      <h1>Global table</h1>
      <p className="muted">
        Verified results from every player whose stats are public.
        {user.stats_visibility !== 'public' && <> Yours are only shown to you here: <Link href="/me">make your stats public</Link> to appear for everyone.</>}
      </p>
      <div className="pills" aria-label="Game">
        {GAMES.map((g) => <Link key={g.id} href={`/global?game=${g.id}`} className={g.id === game.id ? 'on' : ''}>{g.emoji} {g.name}</Link>)}
      </div>
      <div className="cols">
        <div>
          <h2>{game.emoji} {game.name} today</h2>
          {ranked.length === 0 && <p className="muted">No public results yet today.</p>}
          {ranked.length > 0 && (
            <div className="card table-wrap">
              <table>
                <thead><tr><th>#</th><th className="left">Player</th><th>Score</th></tr></thead>
                <tbody>
                  {ranked.map((r) => (
                    <tr key={r.id} className={r.id === user.id ? 'me' : ''}>
                      <td><Medal pos={r.rank} /></td>
                      <td className="left name"><Link href={`/u/${r.username}`}>{r.display_name}</Link></td>
                      <td><b>{formatScore(game, r.score)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h2>Best ever</h2>
          {best.length === 0 && <p className="muted">Nothing posted yet.</p>}
          <div className="list">
            {best.map((r, i) => (
              <Link href={`/u/${r.username}`} className="card list-row" key={i}>
                <Medal pos={i + 1} />
                <span className="grow"><b>{r.display_name}</b><small className="muted">{prettyDate(r.play_date)}</small></span>
                <span className="pts">{formatScore(game, r.score)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
