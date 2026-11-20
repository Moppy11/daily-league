import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q1 } from '@/lib/db';
import { requireUser, userToday } from '@/lib/auth';
import { GAMES } from '@/lib/games';
import { addDays, prettyDate } from '@/lib/dates';
import { openBallotWeek, ballot, NO_LIMIT } from '@/lib/votes';
import { castVote, nominateGame } from '../../../actions';
import { Flash } from '../../../ui';
import Submit from '../../../Submit';

export const metadata = { title: 'Games vote' };

export default async function VotePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/leagues/${id}/vote`);
  if (!/^\d+$/.test(id)) notFound();
  const league = await q1(
    `select l.id, l.name from leagues l join league_members m on m.league_id = l.id and m.user_id = $2 where l.id = $1`, [Number(id), user.id]);
  if (!league) notFound();
  const today = await userToday();
  const week = openBallotWeek(today);
  const items = week ? await ballot(league.id, week, user.id) : [];
  const onBallot = new Set(items.map((i) => i.game.id));
  const left = items.filter((i) => i.mine === null).length;

  return (
    <>
      <div className="headline">
        <div>
          <h1>{league.name}</h1>
          <p className="muted">🗳️ Vote on next week&apos;s games</p>
        </div>
      </div>
      <div className="pills" aria-label="League sections">
        <Link href={`/leagues/${league.id}`}>🏆 Table</Link>
        <Link href={`/leagues/${league.id}/chat`} prefetch={false}>💬 Chat</Link>
        <Link href={`/leagues/${league.id}/vote`} className="on">🗳️ Games vote{week ? ' · open' : ''}</Link>
      </div>
      <Flash sp={sp} />
      {!week ? (
        <section className="card">
          <p>Voting opens on <b>Friday</b> and closes on <b>Sunday at 11:59pm</b>, just before the league resets.</p>
          <p className="muted small">Everyone votes yes or no on each game. A game with {NO_LIMIT} or more &quot;no&quot; votes is out the next week.</p>
        </section>
      ) : (
        <>
          <section className="card notice">
            <span>
              Vote yes or no on each game, once. <b>Try any game you don&apos;t know before you vote</b>, so the vote is fair.
              {' '}A game with {NO_LIMIT} or more &quot;no&quot; votes is out next week (from {prettyDate(week)}). Voting closes {prettyDate(addDays(week, -1))} at 11:59pm.
            </span>
          </section>
          <p className="muted small">{left ? `${left} game${left === 1 ? '' : 's'} still to vote on.` : 'You have voted on every game. Thanks!'}</p>
          <div className="list">
            {items.map((i) => (
              <section className="card vote-row" key={i.game.id}>
                <div className="row">
                  <span className="emoji">{i.game.emoji}</span>
                  <span className="grow">
                    <b>{i.game.name}</b>
                    <small className="muted"> · {i.inNow ? 'in the league now' : `new, put forward by ${i.nominatedBy}`}</small>
                  </span>
                  {i.game.url && <a className="btn small" href={i.game.url} target="_blank" rel="noreferrer">Try it ↗</a>}
                </div>
                {i.mine === null ? (
                  <form action={castVote} className="row vote-buttons">
                    <input type="hidden" name="league" value={league.id} />
                    <input type="hidden" name="game" value={i.game.id} />
                    <Submit className="btn small primary" name="vote" value="yes">👍 Yes, keep / add it</Submit>
                    <Submit className="btn small danger" name="vote" value="no">👎 No</Submit>
                  </form>
                ) : (
                  <p className="small">
                    You voted <b>{i.mine ? 'yes 👍' : 'no 👎'}</b> · so far {i.yes} yes, {i.no} no
                    {i.no >= NO_LIMIT ? <b className="vote-out"> · out next week as it stands</b> : ''}
                  </p>
                )}
              </section>
            ))}
          </div>
          <h2>Put a game forward</h2>
          <form action={nominateGame} className="card row">
            <input type="hidden" name="league" value={league.id} />
            <select name="game" className="grow" aria-label="Game to put forward" required defaultValue="">
              <option value="" disabled>Pick a game…</option>
              {GAMES.filter((g) => !onBallot.has(g.id)).sort((a, b) => a.name.localeCompare(b.name)).map((g) => (
                <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>
              ))}
            </select>
            <Submit className="btn">Add to the vote</Submit>
          </form>
          <p className="muted small">A game put forward joins next week unless {NO_LIMIT} or more people vote no.</p>
        </>
      )}
    </>
  );
}
