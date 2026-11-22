import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q1 } from '@/lib/db';
import { requireUser, userToday } from '@/lib/auth';
import { GAMES } from '@/lib/games';
import { addDays, prettyDate } from '@/lib/dates';
import { openBallotWeek, ballot, pendingTie, NO_LIMIT, MAX_GAMES } from '@/lib/votes';
import { castVote, nominateGame, settleTie, overrideVote } from '../../../actions';
import { Flash } from '../../../ui';
import Submit from '../../../Submit';

export const metadata = { title: 'Games vote' };

export default async function VotePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/leagues/${id}/vote`);
  if (!/^\d+$/.test(id)) notFound();
  const league = await q1(
    `select l.id, l.name, l.owner_id from leagues l join league_members m on m.league_id = l.id and m.user_id = $2 where l.id = $1`, [Number(id), user.id]);
  if (!league) notFound();
  const today = await userToday();
  const week = openBallotWeek(today);
  const items = week ? await ballot(league.id, week, user.id) : [];
  const onBallot = new Set(items.map((i) => i.game.id));
  const left = items.filter((i) => i.mine === null).length;
  const tie = await pendingTie(league.id, today);
  const isAdmin = league.owner_id === user.id;

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
      {tie && (
        <section className="card notice tie">
          <div className="grow">
            <p><b>🤝 It&apos;s a tie for the last {tie.slots === 1 ? 'place' : `${tie.slots} places`}</b> ({MAX_GAMES} games max).{' '}
              {isAdmin ? `Pick ${tie.slots} to play this week; results from Monday count.` : 'The admin is picking. Results from Monday will count.'}</p>
            {isAdmin ? (
              <form action={settleTie} className="stack">
                <input type="hidden" name="league" value={league.id} />
                <div className="checks">
                  {tie.items.map((i) => (
                    <label className="check" key={i.game.id}><input type="checkbox" name="game" value={i.game.id} /> {i.game.emoji} {i.game.name}</label>
                  ))}
                </div>
                <Submit className="btn small primary">Settle the tie</Submit>
              </form>
            ) : <p className="small">{tie.items.map((i) => `${i.game.emoji} ${i.game.name}`).join(' · ')}</p>}
          </div>
        </section>
      )}
      {!week ? (
        <section className="card">
          <p>Voting opens on <b>Friday</b> and closes on <b>Sunday at 11:59pm</b>, just before the league resets.</p>
          <p className="muted small">Everyone votes yes or no on each game. A game with {NO_LIMIT} or more &quot;no&quot; votes is out the next week.</p>
          <p className="muted small">A league plays <b>{MAX_GAMES} games at most</b>, so it never feels like a chore. If more than {MAX_GAMES} get through, the ones with the most &quot;yes&quot; votes go in; a tie for the last place is the admin&apos;s call.</p>
        </section>
      ) : (
        <>
          <section className="card notice">
            <span>
              Vote yes or no on each game; you can change your vote until voting closes. <b>Try any game you don&apos;t know before you vote</b>, so the vote is fair.
              {' '}A game with {NO_LIMIT} or more &quot;no&quot; votes is out next week (from {prettyDate(week)}). Voting closes {prettyDate(addDays(week, -1))} at 11:59pm.
              {' '}<b>{MAX_GAMES} games max:</b> if more get through, the most &quot;yes&quot; votes go in, and a tie for the last place is the admin&apos;s call. The admin can also set any game to always in or always out.
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
                {i.decision && (
                  <p className="small admin-call">
                    🛠️ The admin has set this to <b>{i.decision === 'in' ? 'always in ✅' : 'always out ❌'}</b> next week, whatever the votes say.
                  </p>
                )}
                {/* Votes can be changed until voting closes: your current vote is highlighted. */}
                <form action={castVote} className="row vote-buttons">
                  <input type="hidden" name="league" value={league.id} />
                  <input type="hidden" name="game" value={i.game.id} />
                  <Submit className={'btn small ' + (i.mine === true ? 'primary' : '')} name="vote" value="yes" aria-pressed={i.mine === true}>
                    👍 {i.mine === true ? 'Yes (your vote)' : i.mine === false ? 'Change to yes' : 'Yes, keep / add it'}
                  </Submit>
                  <Submit className={'btn small ' + (i.mine === false ? 'danger-on' : 'danger')} name="vote" value="no" aria-pressed={i.mine === false}>
                    👎 {i.mine === false ? 'No (your vote)' : i.mine === true ? 'Change to no' : 'No'}
                  </Submit>
                </form>
                {i.mine !== null && (
                  <p className="small muted">
                    So far {i.yes} yes, {i.no} no
                    {!i.decision && i.no >= NO_LIMIT ? <b className="vote-out"> · out next week as it stands</b> : ''}
                  </p>
                )}
                {isAdmin && (
                  <form action={overrideVote} className="row admin-override">
                    <input type="hidden" name="league" value={league.id} />
                    <input type="hidden" name="game" value={i.game.id} />
                    <span className="muted small">Admin:</span>
                    <Submit className={'btn small ' + (i.decision === 'in' ? 'primary' : '')} name="decision" value="in">Always in</Submit>
                    <Submit className={'btn small ' + (i.decision === 'out' ? 'danger-on' : '')} name="decision" value="out">Always out</Submit>
                    {i.decision && <Submit className="btn small" name="decision" value="vote">Let the vote decide</Submit>}
                  </form>
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
          <p className="muted small">A game put forward joins next week unless {NO_LIMIT} or more people vote no, and as long as it makes the top {MAX_GAMES}.</p>
        </>
      )}
    </>
  );
}
