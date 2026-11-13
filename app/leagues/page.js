import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser, gamesByIds } from '@/lib/auth';
import { GAMES } from '@/lib/games';
import { createLeague, joinLeague, joinPublic } from '../actions';
import { Flash } from '../ui';
import Submit from '../Submit';

export default async function Leagues({ searchParams }) {
  const sp = await searchParams;
  const find = typeof sp.find === 'string' ? sp.find.trim().slice(0, 40) : '';
  const user = await requireUser('/leagues');
  const leagues = await q(
    `select l.id, l.name, (select count(*) from league_members where league_id = l.id) as players
     from leagues l join league_members m on m.league_id = l.id where m.user_id = $1 order by l.name`,
    [user.id]
  );
  const open = await q(
    `select l.id, l.name, (select count(*) from league_members where league_id = l.id) as players,
       (select string_agg(game_id, ',') from league_games where league_id = l.id) as games
     from leagues l where l.is_public and l.id not in (select league_id from league_members where user_id = $1)
       and ($2 = '' or l.name ilike $3)
     order by players desc, l.id desc limit 12`,
    [user.id, find, '%' + find.replace(/[\\%_]/g, '\\$&') + '%']
  );
  const openGames = await gamesByIds(open.flatMap((l) => (l.games ?? '').split(',')));
  const mineIds = (await q('select game_id from user_games where user_id = $1', [user.id])).map((r) => r.game_id);
  const mine = new Set(mineIds);
  const customs = Object.values(await gamesByIds(mineIds)).filter((g) => g.custom);
  const options = [...GAMES, ...customs];
  const friends = await q(
    `select u.id, u.display_name, u.username from friendships f
     join users u on u.id = case when f.user_id = $1 then f.friend_id else f.user_id end
     where (f.user_id = $1 or f.friend_id = $1) and f.status = 'accepted' order by u.display_name`,
    [user.id]
  );

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

      <Link href="/global" className="card list-row">
        <span className="emoji">🌍</span>
        <span className="grow"><b>Global table</b><small className="muted">Today&apos;s best and all-time bests for every game</small></span>
        <span>→</span>
      </Link>

      {(open.length > 0 || find) && (
        <>
          <h2>Public leagues</h2>
          <form action="/leagues" method="get" className="card row" role="search">
            <input className="grow" name="find" defaultValue={find} placeholder="Find a public league by name" aria-label="Find a public league" />
            <button className="btn">Find</button>
          </form>
          {open.length === 0 && <p className="muted">No public leagues match “{find}”.</p>}
          <div className="list">
            {open.map((l) => (
              <form action={joinPublic} className="card list-row" key={l.id}>
                <input type="hidden" name="league" value={l.id} />
                <span className="grow">
                  <b>{l.name}</b>
                  <small className="muted">{l.players} player{l.players === 1 ? '' : 's'} · {(l.games ?? '').split(',').map((g) => openGames[g]?.emoji).join(' ')}</small>
                </span>
                <Submit className="btn primary small">Join</Submit>
              </form>
            ))}
          </div>
        </>
      )}

      <h2>Join a league</h2>
      <form action={joinLeague} className="card row">
        <input className="grow" name="code" required placeholder="Invite code or link" aria-label="Invite code or link" />
        <Submit>Join</Submit>
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
        <fieldset>
          <legend>Invite friends</legend>
          {friends.length === 0 ? (
            <p className="muted small">Add friends on the <Link href="/friends">Friends page</Link> to invite them here. You can also share an invite link once the league exists.</p>
          ) : (
            <div className="checks">
              {friends.map((f) => (
                <label key={f.id} className="check">
                  <input type="checkbox" name="invite" value={f.id} /> {f.display_name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <Submit>Create league</Submit>
      </form>
    </>
  );
}
