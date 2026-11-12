import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q } from '@/lib/db';
import { requireUser, userToday, gamesByIds } from '@/lib/auth';
import { GAMES, formatScore, formatAvg } from '@/lib/games';
import { addDays, isDate, monthLabel, monthsBetween, prettyDate } from '@/lib/dates';
import { loadLeague } from '@/lib/league';
import { standings, gameStandings, withPositions, rankDay, POINTS } from '@/lib/points';
import { inviteFriend, leaveLeague, setLeagueGames, react } from '../../actions';
import { Flash, Medal } from '../../ui';
import CopyLink from '../../CopyLink';
import Submit from '../../Submit';

const REACTIONS = ['👏', '🔥', '😂', '💀'];

export default async function LeaguePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/leagues/${id}`);
  const data = /^\d+$/.test(id) ? await loadLeague(Number(id)) : null;
  if (!data) notFound();
  const { league, members, games, scores } = data;
  if (!members.some((m) => m.id === user.id)) {
    return <section className="card narrow"><h1>{league.name}</h1><p>You&apos;re not a member of this league. Ask a member for the invite link.</p></section>;
  }

  const today = await userToday();
  const thisMonth = today.slice(0, 7);
  const months = monthsBetween(addDays(league.start_date, 1).slice(0, 7), thisMonth);
  const season = sp.season === 'all' || months.includes(sp.season) ? sp.season : thisMonth;
  const gameList = Object.values(games).sort((a, b) => a.name.localeCompare(b.name));
  const tab = games[sp.tab] ? sp.tab : 'overall';
  const date = isDate(sp.date) && sp.date <= today ? sp.date : today;
  const base = `/leagues/${league.id}`;
  const href = (over) => {
    const p = { tab, season, date, ...over };
    const qs = new URLSearchParams();
    if (p.tab !== 'overall') qs.set('tab', p.tab);
    if (p.season !== thisMonth) qs.set('season', p.season);
    if (p.date !== today) qs.set('date', p.date);
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };

  const inSeason = season === 'all' ? scores : scores.filter((s) => s.play_date.startsWith(season));
  const table = withPositions(tab === 'overall' ? standings(inSeason, games, members) : gameStandings(inSeason, games[tab], members));

  // Points earned today, shown beside the table while looking at a season that includes today.
  const showToday = season === 'all' || season === thisMonth;
  const todayPts = {};
  if (showToday) {
    const tGames = tab === 'overall' ? games : { [tab]: games[tab] };
    for (const r of standings(scores.filter((s) => s.play_date === today), tGames, members)) todayPts[r.user.id] = r.played ? r.total : null;
  }

  // Winners of finished months.
  const champions = months.filter((m) => m < thisMonth).map((m) => {
    const top = standings(scores.filter((s) => s.play_date.startsWith(m)), games, members)[0];
    return top && top.total > 0 ? { month: m, user: top.user, total: top.total } : null;
  }).filter(Boolean);

  // Results for the chosen day.
  const dayScores = scores.filter((s) => s.play_date === date);
  const reactionRows = dayScores.length
    ? await q(
        `select score_id, emoji, count(*) as n, bool_or(user_id = $2) as mine from reactions
         where score_id = any($1) group by score_id, emoji`,
        [dayScores.map((s) => s.id), user.id]
      )
    : [];
  const pastes = dayScores.length
    ? Object.fromEntries((await q('select id, raw from scores where id = any($1) and raw is not null', [dayScores.map((s) => s.id)])).map((r) => [r.id, r.raw]))
    : {};
  const reactions = {};
  for (const r of reactionRows) (reactions[r.score_id] ??= {})[r.emoji] = r;
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));

  const friends = await q(
    `select u.id, u.display_name from friendships f
     join users u on u.id = case when f.user_id = $1 then f.friend_id else f.user_id end
     where (f.user_id = $1 or f.friend_id = $1) and f.status = 'accepted'
       and u.id not in (select user_id from league_members where league_id = $2)
       and u.id not in (select user_id from league_invites where league_id = $2)
     order by u.display_name`,
    [user.id, league.id]
  );
  const isOwner = league.owner_id === user.id;
  let gameOptions = [];
  if (isOwner) {
    const mineIds = (await q('select game_id from user_games where user_id = $1', [user.id])).map((r) => r.game_id);
    const customs = Object.values(await gamesByIds([...mineIds, ...Object.keys(games)])).filter((g) => g.custom);
    gameOptions = [...GAMES, ...customs];
  }

  return (
    <>
      <div className="headline">
        <div>
          <h1>{league.name}</h1>
          <p className="muted">{members.length} player{members.length === 1 ? '' : 's'} · {gameList.map((g) => g.emoji).join(' ')}</p>
        </div>
        <CopyLink path={`/join/${league.code}`} />
      </div>
      <Flash sp={sp} />

      <div className="cols">
      <div>
      <div className="pills" aria-label="Season">
        {months.slice(0, 6).map((m) => (
          <Link key={m} href={href({ season: m })} className={season === m ? 'on' : ''}>{m === thisMonth ? 'This month' : monthLabel(m)}</Link>
        ))}
        <Link href={href({ season: 'all' })} className={season === 'all' ? 'on' : ''}>All-time</Link>
      </div>
      <div className="pills" aria-label="Table">
        <Link href={href({ tab: 'overall' })} className={tab === 'overall' ? 'on' : ''}>Overall</Link>
        {gameList.map((g) => (
          <Link key={g.id} href={href({ tab: g.id })} className={tab === g.id ? 'on' : ''}>{g.emoji} {g.name}</Link>
        ))}
      </div>

      <div className="card table-wrap">
        <table className={tab === 'overall' ? '' : 'wide'}>
          <thead>
            <tr>
              <th>#</th><th className="left">Player</th><th>Played</th><th className="opt">Wins</th>
              {tab !== 'overall' && <th>Avg</th>}
              {showToday && <th>Today</th>}
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.user.id} className={r.user.id === user.id ? 'me' : ''}>
                <td><Medal pos={r.pos} /></td>
                <td className="left name"><Link href={`/u/${r.user.username}`}>{r.user.display_name}</Link></td>
                <td>{r.played}</td>
                <td className="opt">{r.wins}</td>
                {tab !== 'overall' && <td>{formatAvg(games[tab], r.avg)}</td>}
                {showToday && <td className={todayPts[r.user.id] ? 'plus-cell' : 'muted'}>{todayPts[r.user.id] ? `+${todayPts[r.user.id]}` : '–'}</td>}
                <td><b>{r.total}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Each day, each game: 1st gets {POINTS[0]}, then {POINTS.slice(1).join(', ')}, and 1 for anyone else who played. Ties share the better place.
        Tap a player to see their profile or add them as a friend.
      </p>

      {champions.length > 0 && (
        <>
          <h2>Champions</h2>
          <div className="list">
            {champions.map((c) => (
              <div className="card list-row" key={c.month}>
                <span className="emoji">👑</span>
                <span className="grow"><b>{c.user.display_name}</b><small className="muted">{monthLabel(c.month)}</small></span>
                <span className="pts">{c.total}<small>pts</small></span>
              </div>
            ))}
          </div>
        </>
      )}

      </div>
      <div>
      <div className="daynav">
        <Link href={href({ date: addDays(date, -1) })} aria-label="Previous day">←</Link>
        <h2>{date === today ? 'Today' : prettyDate(date)}</h2>
        {date < today ? <Link href={href({ date: addDays(date, 1) })} aria-label="Next day">→</Link> : <span />}
      </div>
      {dayScores.length === 0 && <p className="muted">No results posted{date === today ? ' yet' : ''}.</p>}
      {gameList.map((g) => {
        const entries = dayScores.filter((s) => s.game_id === g.id);
        if (!entries.length) return null;
        const waiting = date === today ? members.filter((m) => !entries.some((e) => e.user_id === m.id)) : [];
        const ranked = rankDay(entries, g.higherBetter);
        entries.sort((a, b) => ranked.get(a.user_id).rank - ranked.get(b.user_id).rank);
        return (
          <div className="card day" key={g.id}>
            <h3>{g.emoji} {g.name}</h3>
            {entries.map((s) => (
              <div className="result" key={s.id}>
                <Medal pos={ranked.get(s.user_id).rank} />
                <span className="grow">
                  <Link className="player" href={`/u/${byId[s.user_id].username}`}>{byId[s.user_id].display_name}</Link>
                  {s.manual && <small className="manual-score">✍️ Entered by hand, not verified</small>}
                  {s.flagged && <small className="manual-score">⚠️ Puzzle number differs from other players</small>}
                </span>
                <b>{formatScore(g, s.score)}</b>
                <span className="plus">+{ranked.get(s.user_id).points}</span>
                <form action={react} className="reacts">
                  <input type="hidden" name="score" value={s.id} />
                  <input type="hidden" name="back" value={href({})} />
                  {REACTIONS.map((e) => {
                    const r = reactions[s.id]?.[e];
                    return (
                      <button key={e} name="emoji" value={e} className={r?.mine ? 'on' : ''} aria-label={`React ${e}`}>
                        {e}{r ? <small>{r.n}</small> : null}
                      </button>
                    );
                  })}
                </form>
                {pastes[s.id] && (
                  <details className="paste">
                    <summary>See what was pasted</summary>
                    <pre>{pastes[s.id]}</pre>
                  </details>
                )}
              </div>
            ))}
            {waiting.length > 0 && <p className="muted small waiting">Still to play: {waiting.map((m) => m.display_name).join(', ')}</p>}
          </div>
        );
      })}

      </div>
      </div>

      <h2>Manage</h2>
      {friends.length > 0 && (
        <form action={inviteFriend} className="card row">
          <input type="hidden" name="league" value={league.id} />
          <select name="friend" className="grow" aria-label="Friend to invite">
            {friends.map((f) => <option key={f.id} value={f.id}>{f.display_name}</option>)}
          </select>
          <Submit>Invite friend</Submit>
        </form>
      )}
      {isOwner && (
        <details className="card">
          <summary>Change which games count</summary>
          <form action={setLeagueGames} className="stack">
            <input type="hidden" name="league" value={league.id} />
            <div className="checks">
              {gameOptions.map((g) => (
                <label key={g.id} className="check">
                  <input type="checkbox" name="games" value={g.id} defaultChecked={!!games[g.id]} /> {g.emoji} {g.name}
                </label>
              ))}
            </div>
            <Submit>Save games</Submit>
          </form>
        </details>
      )}
      <details className="card">
        <summary>Leave league</summary>
        <form action={leaveLeague} className="stack">
          <input type="hidden" name="league" value={league.id} />
          <p className="muted">
            {isOwner && members.length === 1 ? 'You are the only member, so this closes the league.'
              : isOwner ? 'The league passes to the next longest-standing member.' : 'You can rejoin later with the invite link.'}
          </p>
          <Submit className="btn danger">Leave {league.name}</Submit>
        </form>
      </details>
    </>
  );
}
