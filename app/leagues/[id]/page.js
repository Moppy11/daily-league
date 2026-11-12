import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q } from '@/lib/db';
import { requireUser, userToday, gamesByIds } from '@/lib/auth';
import { GAMES, formatScore, formatAvg } from '@/lib/games';
import { addDays, isDate, weekStart, weeksBetween, weekLabel, prettyDate } from '@/lib/dates';
import { weeklyWinners, weeklyWinCounts, leagueRecords } from '@/lib/records';
import { loadLeague } from '@/lib/league';
import { standings, gameStandings, withPositions, rankDay, POINTS } from '@/lib/points';
import { inviteFriend, leaveLeague, setLeagueGames, react, nudge } from '../../actions';
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
  const thisWeek = weekStart(today);
  const weeks = weeksBetween(addDays(league.start_date, 1), today);
  const season = sp.season === 'all' || weeks.includes(sp.season) ? sp.season : thisWeek;
  const gameList = Object.values(games).sort((a, b) => a.name.localeCompare(b.name));
  const tab = games[sp.tab] ? sp.tab : 'overall';
  const date = isDate(sp.date) && sp.date <= today ? sp.date : today;
  const base = `/leagues/${league.id}`;
  const href = (over) => {
    const p = { tab, season, date, ...over };
    const qs = new URLSearchParams();
    if (p.tab !== 'overall') qs.set('tab', p.tab);
    if (p.season !== thisWeek) qs.set('season', p.season);
    if (p.date !== today) qs.set('date', p.date);
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };

  const inSeason = season === 'all' ? scores : scores.filter((s) => s.play_date >= season && s.play_date <= addDays(season, 6));
  const table = withPositions(tab === 'overall' ? standings(inSeason, games, members) : gameStandings(inSeason, games[tab], members));

  // Points earned today, shown beside the table while looking at a season that includes today.
  const showToday = season === 'all' || season === thisWeek;
  const todayPts = {};
  if (showToday) {
    const tGames = tab === 'overall' ? games : { [tab]: games[tab] };
    for (const r of standings(scores.filter((s) => s.play_date === today), tGames, members)) todayPts[r.user.id] = r.played ? r.total : null;
  }

  // Winners of finished weeks, how many weeks each player has won, and the all-time records.
  const champions = weeklyWinners(scores, games, members, thisWeek);
  const weekWins = weeklyWinCounts(champions);
  const records = leagueRecords(scores, games, members, thisWeek);
  const names = (r) => (r.users.length > 3 ? `${r.users.length} players` : r.users.map((u) => u.display_name).join(' & '));

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
  const admin = byId[league.owner_id];
  const unseen = (await q(
    `select count(*) as n from league_messages m join league_members lm on lm.league_id = m.league_id and lm.user_id = $2
     where m.league_id = $1 and m.id > lm.chat_seen_id and m.user_id <> $2`,
    [league.id, user.id]
  ))[0].n;
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
      <div className="pills" aria-label="League sections">
        <Link href={base} className="on">🏆 Standings</Link>
        <Link href={`${base}/chat`} prefetch={false}>💬 Chat{unseen > 0 ? ` · ${unseen} new` : ''}</Link>
      </div>
      <Flash sp={sp} />

      <div className="cols">
      <div>
      <div className="pills" aria-label="Season">
        {weeks.slice(0, 5).map((w) => (
          <Link key={w} href={href({ season: w })} className={season === w ? 'on' : ''}>{w === thisWeek ? 'This week' : weekLabel(w)}</Link>
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
              <th>#</th><th className="left">Player</th><th className="opt2">Played</th><th className="opt" title="Days won">Wins</th>
              {tab === 'overall' && <th title="Weeks won">Weeks</th>}
              {tab !== 'overall' && <th>Avg</th>}
              {showToday && <th>Today</th>}
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.user.id} className={r.user.id === user.id ? 'me' : ''}>
                <td><Medal pos={r.pos} /></td>
                <td className="left name"><Link href={`/u/${r.user.username}`}>{r.user.display_name}</Link>{r.user.id === league.owner_id && <small className="muted"> · admin</small>}</td>
                <td className="opt2">{r.played}</td>
                <td className="opt">{r.wins}</td>
                {tab === 'overall' && <td>{weekWins[r.user.id] ? `🏆 ${weekWins[r.user.id]}` : <span className="muted">–</span>}</td>}
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
        The table resets every Monday; whoever is top on Sunday night wins the week (🏆).
        Tap a player to see their profile or add them as a friend.
      </p>

      {champions.length > 0 && (
        <>
          <h2>Weekly winners</h2>
          <div className="list">
            {champions.slice(0, 6).map((c) => (
              <div className="card list-row" key={c.week}>
                <span className="emoji">👑</span>
                <span className="grow"><b>{c.winners.map((u) => u.display_name).join(' & ')}</b><small className="muted">{weekLabel(c.week)}</small></span>
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
            {waiting.length > 0 && (
              <form action={nudge} className="waiting row">
                <input type="hidden" name="league" value={league.id} />
                <input type="hidden" name="game" value={g.id} />
                <span className="muted small grow">Still to play: {waiting.map((m) => m.display_name).join(', ')}</span>
                {waiting.some((m) => m.id !== user.id) && <Submit className="btn small">⏰ Remind</Submit>}
              </form>
            )}
          </div>
        );
      })}

      </div>
      </div>

      {records.perGame.length > 0 && (
        <>
          <h2>All-time records</h2>
          <div className="grid records">
            <section className="card">
              <h3>🏅 League</h3>
              <dl>
                {records.league.bestWeek && <><dt>Most points in a week</dt><dd><b>{records.league.bestWeek.value}</b> {names(records.league.bestWeek)} <small className="muted">{weekLabel(records.league.bestWeek.extra)}</small></dd></>}
                {records.league.bestDay && <><dt>Most points in a day</dt><dd><b>{records.league.bestDay.value}</b> {names(records.league.bestDay)} <small className="muted">{prettyDate(records.league.bestDay.extra)}</small></dd></>}
                {records.league.weeklyWins && <><dt>Most weeks won</dt><dd><b>{records.league.weeklyWins.value}</b> {names(records.league.weeklyWins)}</dd></>}
                {records.league.streak && <><dt>Longest posting streak</dt><dd><b>{records.league.streak.value} days</b> {names(records.league.streak)}</dd></>}
                {records.league.posted && <><dt>Most results posted</dt><dd><b>{records.league.posted.value}</b> {names(records.league.posted)}</dd></>}
              </dl>
            </section>
            {records.perGame.map((r) => (
              <section className="card" key={r.game.id}>
                <h3>{r.game.emoji} {r.game.name}</h3>
                <dl>
                  {r.best && <><dt>{r.game.higherBetter ? 'Highest score' : 'Best score'}</dt><dd><b>{formatScore(r.game, r.best.value)}</b> {names(r.best)} <small className="muted">{prettyDate(r.best.extra)}</small></dd></>}
                  {r.average && <><dt>Best average</dt><dd><b>{formatAvg(r.game, r.average.value)}</b> {names(r.average)}</dd></>}
                  {r.wins && <><dt>Most days won</dt><dd><b>{r.wins.value}</b> {names(r.wins)}</dd></>}
                  {r.streak && <><dt>Longest streak</dt><dd><b>{r.streak.value} days</b> {names(r.streak)}</dd></>}
                </dl>
              </section>
            ))}
          </div>
        </>
      )}

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
      {!isOwner && (
        <p className="card muted">
          Only the admin ({admin?.display_name}) can change which games count.{' '}
          <Link href={`${base}/chat`}>Request a game in the chat</Link>.
        </p>
      )}
      {isOwner && (
        <details className="card">
          <summary>Change which games count (admin only)</summary>
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
              : isOwner ? 'You are the admin, so the league passes to the next longest-standing member.' : 'You can rejoin later with the invite link.'}
          </p>
          <Submit className="btn danger">Leave {league.name}</Submit>
        </form>
      </details>
    </>
  );
}
