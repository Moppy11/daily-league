import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser, gamesByIds } from '@/lib/auth';
import { GAMES } from '@/lib/games';
import { createLeague, joinLeague } from '../actions';
import { Flash } from '../ui';

export default async function Leagues({ searchParams }) {
  const sp = await searchParams;
  const user = await requireUser('/leagues');
  const leagues = await q(
    `select l.id, l.name, (select count(*) from league_members where league_id = l.id) as players
     from leagues l join league_members m on m.league_id = l.id where m.user_id = $1 order by l.name`,
    [user.id]
  );
  const mineIds = (await q('select game_id from user_games where user_id = $1', [user.id])).map((r) => r.game_id);
  const mine = new Set(mineIds);
  const customs = Object.values(await gamesByIds(mineIds)).filter((g) => g.custom);
  const options = [...GAMES, ...customs];

  return (
    <>
      <h1>Leagues</h1>
      <Flash sp={sp} />
      {leagues.length === 0 && <p className="muted">You&apos;re not in a league yet.</p>}
      <div className="list">
        {leagues.map((l) => (
          <Link href={`/leagues/${l.id}`} className="card list-row" key={l.id}>
            <span className="emoji">🏆</span>
            <span className="grow"><b>{l.name}</b><small className="muted">{l.players} player{l.players === 1 ? '' : 's'}</small></span>
            <span>→</span>
          </Link>
        ))}
      </div>

      <h2>Join a league</h2>
      <form action={joinLeague} className="card row">
        <input className="grow" name="code" required placeholder="Invite code or link" aria-label="Invite code or link" />
        <button className="btn primary">Join</button>
      </form>

      <h2>Create a league</h2>
      <form action={createLeague} className="card stack">
        <label>League name<input name="name" required maxLength={40} placeholder="e.g. Office Dailies" /></label>
        <fieldset>
          <legend>Games that count</legend>
          <div className="checks">
            {options.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" name="games" value={g.id} defaultChecked={mine.has(g.id)} /> {g.emoji} {g.name}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn primary">Create league</button>
      </form>
    </>
  );
}
