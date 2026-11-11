import Link from 'next/link';
import { q } from '@/lib/db';
import { getUser, userToday, gamesByIds } from '@/lib/auth';
import { formatScore } from '@/lib/games';
import { addDays, prettyDate } from '@/lib/dates';
import { loadLeague } from '@/lib/league';
import { standings, withPositions } from '@/lib/points';
import { submitScore, respondInvite } from './actions';
import { Flash, Medal } from './ui';

function Landing() {
  return (
    <section className="hero">
      <h1>One league for all your daily games</h1>
      <p>
        Post your Krillion, Wordle, Connections and other daily results, earn points against your
        friends every day, and climb the monthly table.
      </p>
      <div className="row center">
        <Link className="btn primary" href="/signup">Create an account</Link>
        <Link className="btn" href="/login">Log in</Link>
      </div>
      <ul className="features">
        <li><b>Paste to score.</b> Copy the game&apos;s share text and paste it in. Results lock once posted.</li>
        <li><b>Leagues.</b> Invite friends with a link. An overall table plus one for each game.</li>
        <li><b>Monthly seasons.</b> A fresh race every month, with an all-time table alongside.</li>
        <li><b>Your stats.</b> Averages, bests, streaks and history for every game you play.</li>
      </ul>
    </section>
  );
}

export default async function Home({ searchParams }) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) return <Landing />;

  const today = await userToday();
  const [mine, leagueRows, invites, requests, dates] = await Promise.all([
    q('select game_id from user_games where user_id = $1', [user.id]),
    q(`select l.id from leagues l join league_members m on m.league_id = l.id where m.user_id = $1 order by l.id`, [user.id]),
    q(`select l.id, l.name, u.display_name as inviter from league_invites i
       join leagues l on l.id = i.league_id join users u on u.id = i.invited_by where i.user_id = $1`, [user.id]),
    q(`select count(*) as n from friendships where friend_id = $1 and status = 'pending'`, [user.id]),
    q('select distinct play_date from scores where user_id = $1 and play_date >= $2', [user.id, addDays(today, -400)]),
  ]);

  const leagues = (await Promise.all(leagueRows.map((r) => loadLeague(r.id)))).filter(Boolean);
  const ids = new Set(mine.map((r) => r.game_id));
  for (const l of leagues) for (const id of Object.keys(l.games)) ids.add(id);
  const games = Object.values(await gamesByIds([...ids])).sort((a, b) => a.name.localeCompare(b.name));
  const todays = await q('select game_id, score, manual from scores where user_id = $1 and play_date = $2', [user.id, today]);
  const done = Object.fromEntries(todays.map((s) => [s.game_id, s]));

  // Consecutive days with at least one result, counting today if played.
  const played = new Set(dates.map((d) => d.play_date));
  let streak = 0;
  for (let d = played.has(today) ? today : addDays(today, -1); played.has(d); d = addDays(d, -1)) streak++;

  const month = today.slice(0, 7);
  const remaining = games.filter((g) => !done[g.id]).length;

  return (
    <>
      <div className="headline">
        <div>
          <h1>{prettyDate(today)}</h1>
          <p className="muted">
            {games.length === 0 ? 'Pick the games you play to get started.'
              : remaining === 0 ? 'All done for today.' : `${remaining} of ${games.length} still to post.`}
          </p>
        </div>
        <div className="streak" title="Days in a row with a result posted">🔥 {streak}<small>day streak</small></div>
      </div>
      <Flash sp={sp} />

      {invites.map((i) => (
        <div className="card notice" key={i.id}>
          <span><b>{i.inviter}</b> invited you to <b>{i.name}</b></span>
          <form action={respondInvite} className="row">
            <input type="hidden" name="league" value={i.id} />
            <button className="btn primary small" name="answer" value="accept">Join</button>
            <button className="btn small" name="answer" value="decline">Decline</button>
          </form>
        </div>
      ))}
      {requests[0].n > 0 && (
        <Link href="/friends" className="card notice">You have {requests[0].n} friend request{requests[0].n > 1 ? 's' : ''} →</Link>
      )}

      <h2>Today&apos;s games</h2>
      {games.length === 0 && (
        <div className="card empty">
          <p>You haven&apos;t added any games yet.</p>
          <Link className="btn primary" href="/games">Choose your games</Link>
        </div>
      )}
      <div className="grid">
        {games.map((g) => {
          const s = done[g.id];
          return (
            <div className={'card game' + (s ? ' done' : '')} key={g.id}>
              <div className="game-head">
                <span className="emoji">{g.emoji}</span>
                <b>{g.name}</b>
                {s ? <span className="score">{formatScore(g, s.score)} 🔒</span>
                  : g.url && <a className="btn small" href={g.url} target="_blank" rel="noreferrer">Play ↗</a>}
              </div>
              {!s && (
                <form action={submitScore} className="stack">
                  <input type="hidden" name="game" value={g.id} />
                  {g.parse ? (
                    <>
                      <textarea name="text" rows={2} placeholder={g.hint} aria-label={`${g.name} share text`} />
                      <details>
                        <summary>No share text? Enter it by hand</summary>
                        <input name="manual" placeholder={manualHint(g)} aria-label={`${g.name} score`} />
                        <small className="muted">Hand-typed scores are marked ✍️ for your league.</small>
                      </details>
                    </>
                  ) : (
                    <input name="manual" required placeholder={manualHint(g)} aria-label={`${g.name} score`} />
                  )}
                  <button className="btn primary small">Post score</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
      {games.length > 0 && <p className="muted small">Scores lock once posted and can only be posted for today.</p>}

      <h2>Your leagues</h2>
      {leagues.length === 0 && (
        <div className="card empty">
          <p>Start a league and invite your friends, or join one with an invite link.</p>
          <Link className="btn primary" href="/leagues">Create or join a league</Link>
        </div>
      )}
      {leagues.map((l) => {
        const table = withPositions(standings(l.scores.filter((s) => s.play_date.startsWith(month)), l.games, l.members));
        const me = table.find((r) => r.user.id === user.id);
        return (
          <Link href={`/leagues/${l.league.id}`} className="card league-row" key={l.league.id}>
            <Medal pos={me.pos} />
            <span className="grow"><b>{l.league.name}</b><small className="muted">{l.members.length} players · this month</small></span>
            <span className="pts">{me.total}<small>pts</small></span>
          </Link>
        );
      })}
    </>
  );
}

function manualHint(g) {
  if (g.type === 'guesses') return `Guesses (1–${g.max}, or X)`;
  if (g.type === 'time') return 'Time, e.g. 1:23';
  if (g.type === 'points') return `Score (0–${g.max})`;
  return `Score (${g.unit})`;
}
