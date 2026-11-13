import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q } from '@/lib/db';
import { requireUser, userToday, gamesByIds } from '@/lib/auth';
import { GAMES, formatScore, formatAvg } from '@/lib/games';
import { addDays, isDate, weekStart, weekLabel, prettyDate } from '@/lib/dates';
import { weeklyWinners, weeklyWinCounts, leagueRecords } from '@/lib/records';
import { loadLeague, ensureRecap } from '@/lib/league';
import { standings, withPositions, rankDay, POINTS } from '@/lib/points';
import { inviteFriend, leaveLeague, setLeagueGames, nudge, manageMember, queryScore, keepScore, removeScore } from '../../actions';
import { Flash, Medal } from '../../ui';
import CopyLink from '../../CopyLink';
import Submit from '../../Submit';

export default async function LeaguePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/leagues/${id}`);
  const data = /^\d+$/.test(id) ? await loadLeague(Number(id)) : null;
  if (!data) notFound();
  const { league, members, games, scores, weights, opts } = data;
  if (!members.some((m) => m.id === user.id)) {
    return <section className="card narrow"><h1>{league.name}</h1><p>You&apos;re not a member of this league. Ask a member for the invite link.</p></section>;
  }

  const today = await userToday();
  const thisWeek = weekStart(today);
  await ensureRecap(data, thisWeek);
  const view = sp.view === 'all' ? 'all' : 'week';
  const date = isDate(sp.date) && sp.date <= today ? sp.date : today;
  const gameList = Object.values(games).sort((a, b) => a.name.localeCompare(b.name));
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const base = `/leagues/${league.id}`;
  const href = (over) => {
    const p = { view, date, ...over };
    const qs = new URLSearchParams();
    if (p.view !== 'week') qs.set('view', p.view);
    if (p.date !== today) qs.set('date', p.date);
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };

  // ---- The league table ----
  const inView = view === 'all' ? scores : scores.filter((s) => s.play_date >= thisWeek);
  const rule = view === 'all' ? opts.all : opts.week;
  const table = withPositions(standings(inView, games, members, rule));
  // Where everyone stood before today's results, for the up and down arrows.
  const before = Object.fromEntries(withPositions(standings(inView.filter((s) => s.play_date < today), games, members, rule)).map((r) => [r.user.id, r.pos]));
  const anyToday = inView.some((s) => s.play_date === today);
  const todayPts = Object.fromEntries(standings(scores.filter((s) => s.play_date === today), games, members, opts.all).map((r) => [r.user.id, r.played ? r.total : null]));
  const champions = weeklyWinners(scores, games, members, thisWeek, opts.week);
  const weekWins = weeklyWinCounts(champions);
  const records = leagueRecords(scores, games, members, thisWeek, opts);
  const names = (r) => (r.users.length > 3 ? `${r.users.length} players` : r.users.map((u) => u.display_name).join(' & '));

  // ---- Results for the chosen day, game by game ----
  const dayScores = scores.filter((s) => s.play_date === date);
  const ids = dayScores.map((s) => s.id);
  const [pasteRows, flagRows, proofRows] = ids.length
    ? await Promise.all([
        q('select id, raw from scores where id = any($1) and raw is not null', [ids]),
        q(`select score_id, count(*) as n, bool_or(user_id = $3) as mine from score_flags where league_id = $2 and score_id = any($1) group by score_id`, [ids, league.id, user.id]),
        q('select score_id from proofs where score_id = any($1)', [ids]),
      ])
    : [[], [], []];
  const pastes = Object.fromEntries(pasteRows.map((r) => [r.id, r.raw]));
  const flags = Object.fromEntries(flagRows.map((f) => [f.score_id, f]));
  const proofs = new Set(proofRows.map((r) => r.score_id));
  const mineToday = new Set(scores.filter((s) => s.play_date === today && s.user_id === user.id).map((s) => s.game_id));

  // ---- Chat badge, friends to invite, admin settings ----
  const isOwner = league.owner_id === user.id;
  const admin = byId[league.owner_id];
  const [unseenRow, friends] = await Promise.all([
    q(`select count(*) as n from league_messages m join league_members lm on lm.league_id = m.league_id and lm.user_id = $2
       where m.league_id = $1 and m.id > lm.chat_seen_id and m.user_id <> $2`, [league.id, user.id]),
    q(`select u.id, u.display_name from friendships f
       join users u on u.id = case when f.user_id = $1 then f.friend_id else f.user_id end
       where (f.user_id = $1 or f.friend_id = $1) and f.status = 'accepted'
         and u.id not in (select user_id from league_members where league_id = $2)
         and u.id not in (select user_id from league_invites where league_id = $2)
       order by u.display_name`, [user.id, league.id]),
  ]);
  const unseen = unseenRow[0].n;
  let gameOptions = [];
  if (isOwner) {
    const mineIds = (await q('select game_id from user_games where user_id = $1', [user.id])).map((r) => r.game_id);
    const customs = Object.values(await gamesByIds([...mineIds, ...Object.keys(games)])).filter((g) => g.custom);
    gameOptions = [...GAMES, ...customs];
  }
  const rules = [
    Object.entries(weights).some(([, w]) => w > 1) && `Weighted: ${gameList.filter((g) => weights[g.id] > 1).map((g) => `${g.name} ×${weights[g.id]}`).join(', ')}.`,
    league.daily_cap && `Only your best ${league.daily_cap} result${league.daily_cap === 1 ? '' : 's'} each day score.`,
    league.drop_worst && view === 'week' && 'Play all seven days and your lowest day is dropped.',
  ].filter(Boolean);

  return (
    <>
      <div className="headline">
        <div>
          <h1>{league.name}</h1>
          <p className="muted">{members.length} player{members.length === 1 ? '' : 's'} · admin {admin?.display_name}</p>
        </div>
        <CopyLink path={`/join/${league.code}`} />
      </div>

      <div className="pills" aria-label="League sections">
        <Link href={base} className="on">🏆 Table</Link>
        <Link href={`${base}/chat`} prefetch={false}>💬 Chat{unseen > 0 ? ` · ${unseen} new` : ''}</Link>
      </div>

      <nav className="card play-strip" aria-label="Play today's games">
        <b>Play today</b>
        <div className="play-chips">
          {gameList.map((g) => (
            mineToday.has(g.id)
              ? <span key={g.id} className="play-chip done" title="You've posted today">{g.emoji} {g.name} ✓</span>
              : g.url
                ? <a key={g.id} className="play-chip" href={g.url} target="_blank" rel="noreferrer">{g.emoji} {g.name} ↗</a>
                : <span key={g.id} className="play-chip">{g.emoji} {g.name}</span>
          ))}
        </div>
        <Link href="/share" className="btn small primary">Post a result</Link>
      </nav>
      <Flash sp={sp} />

      <div className="cols">
        <div>
          <div className="table-head">
            <h2>League table</h2>
            <div className="seg" role="tablist" aria-label="Period">
              <Link href={href({ view: 'week' })} className={view === 'week' ? 'on' : ''} aria-current={view === 'week' ? 'page' : undefined}>This week</Link>
              <Link href={href({ view: 'all' })} className={view === 'all' ? 'on' : ''} aria-current={view === 'all' ? 'page' : undefined}>All time</Link>
            </div>
          </div>
          <div className="card table-wrap league-table">
            <table>
              <thead>
                <tr>
                  <th title="Position">Pos</th>
                  <th className="left">Player</th>
                  <th title="Results played">P</th>
                  <th title="Games won">W</th>
                  {view === 'all' ? <th title="Weeks won">🏆</th> : <th title="Points so far today">Today</th>}
                  <th title="Points">Pts</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.user.id} className={r.user.id === user.id ? 'me' : ''}>
                    <td className="pos-cell">
                      {r.pos}
                      {anyToday && before[r.user.id] !== r.pos && (
                        before[r.user.id] > r.pos
                          ? <span className="move up" title={`Up ${before[r.user.id] - r.pos} today`}>▲</span>
                          : <span className="move down" title={`Down ${r.pos - before[r.user.id]} today`}>▼</span>
                      )}
                    </td>
                    <td className="left name"><Link href={`/u/${r.user.username}`}>{r.user.display_name}</Link></td>
                    <td>{r.played}</td>
                    <td>{r.wins}</td>
                    {view === 'all'
                      ? <td>{weekWins[r.user.id] ?? <span className="muted">–</span>}</td>
                      : <td className={todayPts[r.user.id] ? 'plus-cell' : 'muted'}>{todayPts[r.user.id] ? `+${todayPts[r.user.id]}` : '–'}</td>}
                    <td className="pts-cell">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            {view === 'week' ? `Week of ${weekLabel(thisWeek)}. Resets every Monday; top on Sunday night wins the week. ` : ''}
            Each game, each day: 1st {POINTS[0]} pts, then {POINTS.slice(1).join(', ')}, and 1 for playing. Today&apos;s games reset at midnight.
            {' '}Results count from the day you joined. {rules.join(' ')}
          </p>
        </div>

        <div>
          <div className="daynav">
            <Link href={href({ date: addDays(date, -1) })} aria-label="Previous day">←</Link>
            <h2>{date === today ? "Today's results" : prettyDate(date)}</h2>
            {date < today ? <Link href={href({ date: addDays(date, 1) })} aria-label="Next day">→</Link> : <span />}
          </div>
          {gameList.map((g) => {
            const entries = dayScores.filter((s) => s.game_id === g.id);
            const ranked = rankDay(entries, g.higherBetter, weights[g.id] ?? 1);
            entries.sort((a, b) => ranked.get(a.user_id).rank - ranked.get(b.user_id).rank);
            const waiting = date === today ? members.filter((m) => !entries.some((e) => e.user_id === m.id)) : [];
            return (
              <section className="card game-board" key={g.id}>
                <div className="game-board-head">
                  <h3>{g.emoji} {g.name}{weights[g.id] > 1 && <small className="muted"> ×{weights[g.id]}</small>}</h3>
                  {date === today && !mineToday.has(g.id) && g.url && <a className="btn small" href={g.url} target="_blank" rel="noreferrer">Play ↗</a>}
                </div>
                {entries.length === 0 && <p className="muted small">No results{date === today ? ' yet' : ''}.</p>}
                <ol className="board">
                  {entries.map((s) => {
                    const f = flags[s.id];
                    return (
                      <li key={s.id}>
                        <span className="board-row">
                          <Medal pos={ranked.get(s.user_id).rank} />
                          <Link className="player grow" href={`/u/${byId[s.user_id].username}`}>{byId[s.user_id].display_name}</Link>
                          {s.manual && <span className="mark" title={s.pasted ? 'Edited after pasting, not verified' : 'Typed by hand, not verified'}>✍️</span>}
                          {s.flagged && <span className="mark" title="Puzzle number differs from other players">⚠️</span>}
                          <b className="board-score">{formatScore(g, s.score)}</b>
                          <details className="flag">
                            <summary className={f ? 'raised' : ''} title="Check or query this result" aria-label={`Check ${byId[s.user_id].display_name}'s result`}>⚑{f ? <small>{f.n}</small> : null}</summary>
                            <div className="flag-panel">
                              {s.manual && <p className="small">{s.pasted ? '✍️ Edited after pasting, so it can\'t be verified.' : '✍️ Typed by hand, so it can\'t be verified.'}</p>}
                              {f && <p className="small queried">Queried by {f.n} player{f.n === 1 ? '' : 's'}.</p>}
                              {pastes[s.id] ? <pre>{pastes[s.id]}</pre> : <p className="muted small">Nothing was pasted for this result.</p>}
                              {proofs.has(s.id) && <p className="small"><a href={`/proof/${s.id}`} target="_blank" rel="noreferrer">📷 See screenshot</a></p>}
                              <form className="row">
                                <input type="hidden" name="league" value={league.id} />
                                <input type="hidden" name="score" value={s.id} />
                                <input type="hidden" name="back" value={href({})} />
                                {s.user_id !== user.id && !f?.mine && <button className="btn small" formAction={queryScore}>⚑ Query this result</button>}
                                {f?.mine && <span className="muted small">You&apos;ve queried this.</span>}
                                {isOwner && f && <button className="btn small" formAction={keepScore}>Keep it</button>}
                                {isOwner && <button className="btn small danger" formAction={removeScore}>Remove from league</button>}
                              </form>
                            </div>
                          </details>
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {waiting.length > 0 && (
                  <form action={nudge} className="waiting row">
                    <input type="hidden" name="league" value={league.id} />
                    <input type="hidden" name="game" value={g.id} />
                    <span className="muted small grow">Still to play: {waiting.map((m) => m.display_name).join(', ')}</span>
                    {waiting.some((m) => m.id !== user.id) && <Submit className="link">⏰ Remind</Submit>}
                  </form>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {champions.length > 0 && (
        <>
          <h2>Weekly winners</h2>
          <div className="card table-wrap">
            <table>
              <tbody>
                {champions.slice(0, 8).map((c) => (
                  <tr key={c.week}>
                    <td className="left muted">{weekLabel(c.week)}</td>
                    <td className="left"><b>👑 {c.winners.map((u) => u.display_name).join(' & ')}</b></td>
                    <td className="pts-cell">{c.total} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {records.perGame.length > 0 && (
        <>
          <h2>League records</h2>
          <p className="muted small">From results posted in this league only.</p>
          <div className="grid records">
            <section className="card">
              <h3>🏅 League</h3>
              <dl>
                {records.league.bestWeek && <><dt>Most points in a week</dt><dd><b>{records.league.bestWeek.value}</b> {names(records.league.bestWeek)} <small className="muted">{weekLabel(records.league.bestWeek.extra)}</small></dd></>}
                {records.league.bestDay && <><dt>Most points in a day</dt><dd><b>{records.league.bestDay.value}</b> {names(records.league.bestDay)} <small className="muted">{prettyDate(records.league.bestDay.extra)}</small></dd></>}
                {records.league.weeklyWins && <><dt>Most weeks won</dt><dd><b>{records.league.weeklyWins.value}</b> {names(records.league.weeklyWins)}</dd></>}
                {records.league.streak && <><dt>Longest posting streak</dt><dd><b>{records.league.streak.value} day{records.league.streak.value === 1 ? '' : 's'}</b> {names(records.league.streak)}</dd></>}
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
                  {r.streak && <><dt>Longest streak</dt><dd><b>{r.streak.value} day{r.streak.value === 1 ? '' : 's'}</b> {names(r.streak)}</dd></>}
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
          <summary>League settings (admin only)</summary>
          <form action={setLeagueGames} className="stack">
            <input type="hidden" name="league" value={league.id} />
            <label>League name<input name="name" defaultValue={league.name} required maxLength={40} /></label>
            <fieldset>
              <legend>Games that count, and how much</legend>
              <div className="checks weights">
                {gameOptions.map((g) => (
                  <span key={g.id} className="check">
                    <label className="check grow">
                      <input type="checkbox" name="games" value={g.id} defaultChecked={!!games[g.id]} /> {g.emoji} {g.name}
                    </label>
                    <select name={`weight_${g.id}`} defaultValue={weights[g.id] ?? 1} aria-label={`${g.name} points weighting`}>
                      <option value="1">×1</option><option value="2">×2</option><option value="3">×3</option>
                    </select>
                  </span>
                ))}
              </div>
            </fieldset>
            <label>Results that score each day
              <select name="daily_cap" defaultValue={league.daily_cap ?? ''}>
                <option value="">All of them</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Each player&apos;s best {n}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" name="drop_worst" defaultChecked={league.drop_worst} /> Comeback rule: drop each player&apos;s lowest day of the week (needs all seven days played)</label>
            <label className="check"><input type="checkbox" name="is_public" defaultChecked={league.is_public} /> Public league: anyone can find and join it</label>
            <Submit>Save settings</Submit>
          </form>
        </details>
      )}
      {isOwner && members.length > 1 && (
        <details className="card">
          <summary>Members (admin only)</summary>
          {members.filter((m) => m.id !== user.id).map((m) => (
            <form action={manageMember} className="result" key={m.id}>
              <input type="hidden" name="league" value={league.id} />
              <input type="hidden" name="member" value={m.id} />
              <span className="grow">{m.display_name} <small className="muted">@{m.username}</small></span>
              <Submit className="btn small" name="do" value="admin">Make admin</Submit>
              <Submit className="btn small danger" name="do" value="remove">Remove</Submit>
            </form>
          ))}
        </details>
      )}
      <details className="card">
        <summary>Leave league</summary>
        <form action={leaveLeague} className="stack">
          <input type="hidden" name="league" value={league.id} />
          <p className="muted">
            {isOwner && members.length === 1 ? 'You are the only member, so this closes the league.'
              : isOwner ? 'You are the admin, so the league passes to the next longest-standing member.' : 'You can rejoin later with the invite link; results count again from the day you rejoin.'}
          </p>
          <Submit className="btn danger">Leave {league.name}</Submit>
        </form>
      </details>
    </>
  );
}
