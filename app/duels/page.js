import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser, userToday, gamesByIds } from '@/lib/auth';
import { duelScore } from '@/lib/duels';
import { addDays, prettyDate } from '@/lib/dates';
import { acceptDuel, declineDuel } from '../actions';
import { Flash } from '../ui';

export default async function Duels({ searchParams }) {
  const sp = await searchParams;
  const user = await requireUser('/duels');
  const today = await userToday();
  const duels = await q(
    `select d.*, c.display_name as c_name, c.username as c_user, o.display_name as o_name, o.username as o_user
     from duels d join users c on c.id = d.challenger_id join users o on o.id = d.opponent_id
     where (d.challenger_id = $1 or d.opponent_id = $1) and d.status <> 'declined' order by d.id desc limit 40`,
    [user.id]
  );
  const games = await gamesByIds(duels.map((d) => d.game_id));
  const people = [...new Set(duels.flatMap((d) => [d.challenger_id, d.opponent_id]))];
  const scores = duels.length
    ? await q('select user_id, game_id, play_date, score from scores where user_id = any($1) and game_id = any($2)', [people, Object.keys(games)])
    : [];

  const rows = duels.filter((d) => games[d.game_id]).map((d) => {
    const s = duelScore(d, games[d.game_id], scores);
    const iAm = d.challenger_id === user.id ? 'challenger' : 'opponent';
    const them = iAm === 'challenger' ? { name: d.o_name, user: d.o_user } : { name: d.c_name, user: d.c_user };
    const me = s[iAm], you = s[iAm === 'challenger' ? 'opponent' : 'challenger'];
    return { d, game: games[d.game_id], them, me, you, played: s.played, end: s.end, over: today > s.end, incoming: d.status === 'pending' && iAm === 'opponent' };
  });
  // A challenge nobody answered before its week ran out is dropped from view.
  const pending = rows.filter((r) => r.d.status === 'pending' && !r.over);
  const live = rows.filter((r) => r.d.status === 'accepted' && !r.over);
  const done = rows.filter((r) => r.d.status === 'accepted' && r.over);
  const verdict = (r) => (r.me > r.you ? 'You won' : r.me < r.you ? `${r.them.name} won` : 'Draw');

  return (
    <>
      <h1>Duels</h1>
      <p className="muted">One game, one friend, seven days. Each day you both post, the better result takes the day. Start one from a friend&apos;s profile.</p>
      <Flash sp={sp} />

      {pending.length > 0 && <h2>Challenges</h2>}
      <div className="list">
        {pending.map((r) => (
          <div className="card list-row" key={r.d.id}>
            <span className="emoji">{r.game.emoji}</span>
            <span className="grow"><b>{r.game.name} v {r.them.name}</b><small className="muted">{prettyDate(r.d.week_start)} to {prettyDate(r.end)}</small></span>
            {r.incoming ? (
              <form className="row">
                <input type="hidden" name="duel" value={r.d.id} />
                <button className="btn primary small" formAction={acceptDuel}>Accept</button>
                <button className="btn small" formAction={declineDuel}>Decline</button>
              </form>
            ) : <span className="tag">Waiting</span>}
          </div>
        ))}
      </div>

      <h2>In play</h2>
      {live.length === 0 && <p className="muted">No duels running. <Link href="/friends">Pick a friend</Link> and challenge them from their profile.</p>}
      <div className="list">
        {live.map((r) => (
          <Link href={`/u/${r.them.user}`} className="card list-row" key={r.d.id}>
            <span className="emoji">{r.game.emoji}</span>
            <span className="grow"><b>{r.game.name} v {r.them.name}</b><small className="muted">Ends {prettyDate(r.end)} · {r.played} day{r.played === 1 ? '' : 's'} played</small></span>
            <span className="pts">{r.me}–{r.you}<small>days won</small></span>
          </Link>
        ))}
      </div>

      {done.length > 0 && <h2>Finished</h2>}
      <div className="list">
        {done.map((r) => (
          <div className="card list-row" key={r.d.id}>
            <span className="emoji">{r.me > r.you ? '🏆' : r.game.emoji}</span>
            <span className="grow"><b>{r.game.name} v {r.them.name}</b><small className="muted">{verdict(r)} · ended {prettyDate(r.end)}</small></span>
            <span className="pts">{r.me}–{r.you}</span>
          </div>
        ))}
      </div>
    </>
  );
}
