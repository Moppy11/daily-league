import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { requireUser, gamesByIds, userToday } from '@/lib/auth';
import { loadLeague, ensureRecap } from '@/lib/league';
import { weekStart } from '@/lib/dates';
import { GAMES } from '@/lib/games';
import { ago } from '@/lib/dates';
import { postMessage, requestGame, decideRequest } from '../../../actions';
import { Flash } from '../../../ui';
import Submit from '../../../Submit';
import AutoRefresh from '../../../AutoRefresh';

export default async function Chat({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/leagues/${id}/chat`);
  const league = /^\d+$/.test(id)
    ? await q1(
        `select l.id, l.name, l.owner_id, u.display_name as admin from leagues l
         join users u on u.id = l.owner_id
         join league_members m on m.league_id = l.id and m.user_id = $2 where l.id = $1`,
        [Number(id), user.id]
      )
    : null;
  if (!league) notFound();
  const isAdmin = league.owner_id === user.id;
  await ensureRecap(await loadLeague(league.id), weekStart(await userToday()));

  const messages = await q(
    `select m.id, m.kind, m.body, m.game_id, m.status, m.created_at, m.user_id, u.display_name, u.username
     from league_messages m join users u on u.id = m.user_id
     where m.league_id = $1 order by m.id desc limit 100`,
    [league.id]
  );
  if (messages.length) {
    await q('update league_members set chat_seen_id = $1 where league_id = $2 and user_id = $3', [messages[0].id, league.id, user.id]);
    await q(`update notifications set read_at = now() where user_id = $1 and kind = 'chat' and link = $2 and read_at is null`, [user.id, `/leagues/${league.id}/chat`]);
  }

  const inLeague = new Set((await q('select game_id from league_games where league_id = $1', [league.id])).map((r) => r.game_id));
  const mineIds = (await q('select game_id from user_games where user_id = $1', [user.id])).map((r) => r.game_id);
  const known = await gamesByIds([...mineIds, ...messages.map((m) => m.game_id).filter(Boolean)]);
  const requestable = [...GAMES, ...Object.values(known).filter((g) => g.custom && mineIds.includes(g.id))].filter((g) => !inLeague.has(g.id));

  return (
    <>
      <AutoRefresh />
      <div className="headline">
        <div>
          <h1>{league.name}</h1>
          <p className="muted">Admin: {league.admin}</p>
        </div>
      </div>
      <div className="pills" aria-label="League sections">
        <Link href={`/leagues/${league.id}`}>🏆 Standings</Link>
        <Link href={`/leagues/${league.id}/chat`} className="on">💬 Chat</Link>
      </div>
      <Flash sp={sp} />

      <div className="cols">
        <div>
          <form action={postMessage} className="card row chat-form">
            <input type="hidden" name="league" value={league.id} />
            <input className="grow" name="body" required maxLength={500} placeholder="Message your league" aria-label="Message" autoComplete="off" />
            <Submit>Send</Submit>
          </form>
          {messages.length === 0 && <p className="muted">No messages yet. Say hello.</p>}
          <div className="chat" aria-live="polite">
            {messages.map((m) => {
              const mine = m.user_id === user.id;
              if (m.kind === 'recap') {
                return (
                  <div className="card recap" key={m.id}>
                    <h3>📰 Weekly recap</h3>
                    <p>{m.body}</p>
                  </div>
                );
              }
              if (m.kind === 'request') {
                const game = known[m.game_id];
                return (
                  <div className="card request" key={m.id}>
                    <p>
                      <span className="emoji">{game?.emoji ?? '🎲'}</span>{' '}
                      <Link className="player" href={`/u/${m.username}`}>{m.display_name}</Link> asked to add{' '}
                      <b>{game?.name ?? 'a game'}</b> to the league.
                    </p>
                    <div className="row">
                      {m.status === 'pending' && isAdmin && (
                        <form action={decideRequest} className="row">
                          <input type="hidden" name="message" value={m.id} />
                          <Submit className="btn primary small" name="answer" value="approve">Add to league</Submit>
                          <Submit className="btn small" name="answer" value="decline">Decline</Submit>
                        </form>
                      )}
                      {m.status === 'pending' && !isAdmin && <span className="tag">Waiting for the admin</span>}
                      {m.status === 'approved' && <span className="tag ok">Added ✓</span>}
                      {m.status === 'declined' && <span className="tag">Declined</span>}
                      <small className="muted">{ago(m.created_at)}</small>
                    </div>
                  </div>
                );
              }
              return (
                <div className={'msg' + (mine ? ' mine' : '')} key={m.id}>
                  <small className="muted">
                    {mine ? 'You' : <Link className="player" href={`/u/${m.username}`}>{m.display_name}</Link>}
                    {m.user_id === league.owner_id && ' · admin'} · {ago(m.created_at)}
                  </small>
                  <p>{m.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <section className="card">
            <h2 className="flush">{isAdmin ? 'Games in this league' : 'Request a game'}</h2>
            {isAdmin ? (
              <p className="muted">
                You&apos;re the admin, so only you can change which games count.
                Requests from other players appear in the chat with Add and Decline buttons.{' '}
                <Link href={`/leagues/${league.id}`}>Change games on the standings page</Link>.
              </p>
            ) : (
              <>
                <p className="muted">Only the admin ({league.admin}) can change which games count. Ask them to add one and it will appear in the chat.</p>
                <form action={requestGame} className="row">
                  <input type="hidden" name="league" value={league.id} />
                  <select name="game" className="grow" aria-label="Game to request" required>
                    {requestable.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
                  </select>
                  <Submit>Request</Submit>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
