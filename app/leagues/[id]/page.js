import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { requireUser, userToday, gamesByIds } from '@/lib/auth';
import { GAMES, formatScore, formatAvg } from '@/lib/games';
import { addDays, isDate, weekStart, weekLabel, prettyDate } from '@/lib/dates';
import { weeklyWinners, weeklyWinCounts, leagueRecords, weekRecap, bestWorstLabels } from '@/lib/records';
import WeeklyRecap from '@/app/WeeklyRecap';
import { recentRecords } from '@/lib/moments';
import { openBallotWeek } from '@/lib/votes';
import { loadLeague, ensureRecap } from '@/lib/league';
import { standings, withPositions, rankDay, POINTS } from '@/lib/points';
import { inviteFriend, leaveLeague, setLeagueGames, nudge, manageMember, queryScore, keepScore, removeScore, laughRecord } from '../../actions';
import { Flash, Medal } from '../../ui';
import CopyLink from '../../CopyLink';
import Submit from '../../Submit';
import ProofLink from '../../ProofLink';
import OncePopup from '../../OncePopup';

// In a narrow tile "645/700" becomes "645"; the full score is in the tooltip.
// Distances drop their unit too ("4,025 m" → "4,025"); the tile's heading says it once.
function shortScore(g, score) {
  if ((g.type === 'points' && g.max) || (g.type === 'count' && g.unit)) {
    const n = Number(score);
    return n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n.toLocaleString('en-GB');   // 44,105 → 44.1k
  }
  return formatScore(g, score);
}

export default async function LeaguePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/leagues/${id}`);
  const data = /^\d+$/.test(id) ? await loadLeague(Number(id), await userToday()) : null;
  if (!data) notFound();
  const { league, members, games, liveGames, plan, scores, weights, opts, penalties, thisWeekHandicap, autoNow, formNow, overrides } = data;
  if (!members.some((m) => m.id === user.id)) {
    return <section className="card narrow"><h1>{league.name}</h1><p>You&apos;re not a member of this league. Ask a member for the invite link.</p></section>;
  }

  const today = await userToday();
  const thisWeek = weekStart(today);
  await ensureRecap(data, thisWeek);
  const view = sp.view === 'all' ? 'all' : sp.view === 'handicap' && data.league.handicap_on ? 'handicap' : 'week';
  const date = isDate(sp.date) && sp.date <= today ? sp.date : today;
  const gameList = Object.values(liveGames).sort((a, b) => a.name.localeCompare(b.name));
  // Changes the admin made today that take effect tomorrow.
  const tomorrow = addDays(today, 1);
  const startsTomorrow = Object.entries(plan).filter(([, p]) => p.added_on === tomorrow).map(([g]) => g);
  const stopsTonight = Object.entries(plan).filter(([, p]) => p.removed_on === tomorrow).map(([g]) => g);
  const planned = (gid) => plan[gid] && (!plan[gid].removed_on || plan[gid].removed_on > tomorrow);
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
  const rule = view === 'all' ? opts.all : view === 'handicap' ? opts.hcapNow : opts.week;
  const decides = (league.handicap_on && league.winner_table === 'handicap') ? 'handicap' : 'week';
  const table = withPositions(standings(inView, games, members, rule));
  // Where everyone stood before today's results, for the up and down arrows.
  const before = Object.fromEntries(withPositions(standings(inView.filter((s) => s.play_date < today), games, members, rule)).map((r) => [r.user.id, r.pos]));
  const anyToday = inView.some((s) => s.play_date === today);
  const todayPts = Object.fromEntries(standings(scores.filter((s) => s.play_date === today), games, members, opts.all).map((r) => [r.user.id, r.played ? r.total : null]));
  const champions = weeklyWinners(scores, games, members, thisWeek, opts.win);
  const weekWins = weeklyWinCounts(champions);
  const records = leagueRecords(scores, games, members, thisWeek, opts);
  // Last week's recap: open at the top until this player closes it, then folded away under the table.
  const lastWeek = addDays(thisWeek, -7);
  const recap = weekRecap(scores, games, members, lastWeek, opts);
  const recapOpen = recap && (members.find((m) => m.id === user.id)?.joined_on ?? today) <= addDays(lastWeek, 6)
    && !(await q1('select 1 from recap_seen where user_id = $1 and league_id = $2 and week = $3', [user.id, league.id, lastWeek]));
  const broken = await recentRecords(league.id, user.id);
  // From Monday 23 Nov (when the handicaps start), the first visit to each league tells the player their handicap,
  // once they've seen the announcement.
  const HANDICAP_POPUP_FROM = process.env.HANDICAP_POPUP_FROM || '2026-11-23';
  const hcapPopup = league.handicap_on && today >= HANDICAP_POPUP_FROM
    && !!(await q1(`select 1 from user_flags where user_id = $1 and key = 'news:handicap'`, [user.id]))
    && !(await q1('select 1 from user_flags where user_id = $1 and key = $2', [user.id, `league-hcap:${league.id}`]));
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
        <Link href={`${base}/vote`} prefetch={false}>🗳️ Games vote{openBallotWeek(today) ? ' · open' : ''}</Link>
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
      {(startsTomorrow.length > 0 || stopsTonight.length > 0) && (
        <p className="card notice small">
          {startsTomorrow.length > 0 && <span>🆕 From tomorrow, <b>{startsTomorrow.map((g) => games[g]?.name ?? g).join(', ')}</b> count{startsTomorrow.length === 1 ? 's' : ''}. </span>}
          {stopsTonight.length > 0 && <span>👋 <b>{stopsTonight.map((g) => games[g]?.name ?? g).join(', ')}</b> stop{stopsTonight.length === 1 ? 's' : ''} counting after today. </span>}
        </p>
      )}
      {penalties.filter((p) => p.kind === 'ban' && p.on_date === today).map((p) => (
        <p className="card notice small" key={p.id}>
          🚫 {p.user_id === user.id ? <><b>You&apos;re</b> banned</> : <><b>{p.display_name}</b> is banned</>} from <b>{games[p.game_id]?.name ?? p.game_id}</b> in this league today
          {p.user_id === user.id ? ': a result you post still counts in your other leagues.' : '.'}{p.reason ? ` Reason: ${p.reason}` : ''}
        </p>
      ))}
      {hcapPopup && (() => {
        const myStart = thisWeekHandicap[user.id] ?? 0, mine = formNow[user.id], ids = Object.keys(formNow);
        const low = ids.length ? Math.min(...ids.map((i) => formNow[i].perDay)) : null;
        const set = overrides.some((o) => o.user_id === user.id);
        return (
          <OncePopup layer={65} flag={`league-hcap:${league.id}`} title={`⚖️ Your handicap in ${league.name}`} tone={myStart < 0 ? 'bad' : 'good'}
            link={{ href: `${base}?view=handicap`, label: 'See the Handicap table' }}>
            <p className="handicap-big">You start this week on <b>{myStart < 0 ? `−${-myStart}` : '0'}</b></p>
            {set ? <p>The admin set your start for this league.</p>
              : mine && low !== null ? (myStart < 0
                ? <p>You average <b>{mine.perDay.toFixed(1)}</b> points a day here and the lowest average is <b>{low.toFixed(1)}</b>, so you start {(mine.perDay - low).toFixed(1)} a day × 7 days × 75% behind.</p>
                : <p>You have the lowest average here ({mine.perDay.toFixed(1)} a day), so everyone else starts behind you. Go get them!</p>)
              : <p>You don&apos;t have 2 days of results here yet, so you start on 0. Your handicap is worked out from next Monday.</p>}
            <p className="muted small">{decides === 'handicap' ? '🏆 The Handicap table decides who wins the week here.' : '🏆 The real table still decides who wins the week here; the Handicap table is for bragging rights.'}</p>
          </OncePopup>
        );
      })()}
      {openBallotWeek(today) && (
        <Link href={`${base}/vote`} className="card notice">
          <span>🗳️ <b>Vote on next week&apos;s games.</b> Open until Sunday 11:59pm. Two &quot;no&quot; votes and a game is out.</span>
          <span>→</span>
        </Link>
      )}
      {recapOpen && <WeeklyRecap recap={recap} league={league} me={user.id} dismiss />}

      <div className="league-main">
        <div>
          <div className="table-head">
            <h2>League table</h2>
            <div className="seg" role="tablist" aria-label="Period">
              <Link href={href({ view: 'week' })} className={view === 'week' ? 'on' : ''} aria-current={view === 'week' ? 'page' : undefined}>This week</Link>
              {league.handicap_on && <Link href={href({ view: 'handicap' })} className={view === 'handicap' ? 'on' : ''} aria-current={view === 'handicap' ? 'page' : undefined}>Handicap</Link>}
              <Link href={href({ view: 'all' })} className={view === 'all' ? 'on' : ''} aria-current={view === 'all' ? 'page' : undefined}>All time</Link>
            </div>
          </div>
          <div className="card table-wrap league-table">
            <table>
              <thead>
                <tr>
                  <th title="Position in the league"><span className="wide-only">Position</span><span className="narrow-only">Rank</span></th>
                  <th className="left">Player</th>
                  <th title="Results posted" className={view === 'handicap' ? '' : 'wide-only'}>Played</th>
                  {view !== 'handicap' && <>
                    <th title="Games won (best result of the day)" className="medal-col">🥇</th>
                    <th title="Second places" className="medal-col">🥈</th>
                    <th title="Third places" className="medal-col">🥉</th>
                  </>}
                  {view === 'all' ? <th title="Weeks finished top">Weeks won</th> : view === 'week' ? <th title="Points earned so far today">Today</th> : null}
                  {view === 'handicap' && <th title="Where this player started the week: 75% of how far ahead of last place they finished last week">Start</th>}
                  <th title="Total points">Points</th>
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
                    <td className={view === 'handicap' ? '' : 'wide-only'}>{r.played}</td>
                    {view !== 'handicap' && <>
                      <td className="medal-col">{r.wins || <span className="muted">–</span>}</td>
                      <td className="medal-col">{r.seconds || <span className="muted">–</span>}</td>
                      <td className="medal-col">{r.thirds || <span className="muted">–</span>}</td>
                    </>}
                    {view === 'all'
                      ? <td>{weekWins[r.user.id] ?? <span className="muted">–</span>}</td>
                      : view === 'week' ? <td className={todayPts[r.user.id] ? 'plus-cell' : 'muted'}>{todayPts[r.user.id] ? `+${todayPts[r.user.id]}` : '–'}</td> : null}
                    {view === 'handicap' && (
                      <td className={r.bonus ? 'minus-cell' : 'muted'} title={formNow[r.user.id] ? `Averages ${formNow[r.user.id].perDay.toFixed(1)} points a day (${formNow[r.user.id].days} days played in the 4 weeks before Monday)` : 'Not enough days played yet'}>
                        {r.bonus ? `−${-r.bonus}` : '0'}
                        {formNow[r.user.id] && <small className="muted form-line">{formNow[r.user.id].perDay.toFixed(1)} a day · {formNow[r.user.id].days}d</small>}
                      </td>
                    )}
                    <td className="pts-cell">{r.total < 0 ? `−${-r.total}` : r.total}{r.penalty > 0 && <small className="penalty" title={`${r.penalty} points taken off by the admin`}> −{r.penalty}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view === 'handicap' && (() => {
            // "How it works", with this player's own numbers.
            const ids = Object.keys(formNow);
            const base = ids.length ? Math.min(...ids.map((i) => formNow[i].perDay)) : null;
            const mine = formNow[user.id], myOverride = overrides.find((o) => o.user_id === user.id);
            const myStart = thisWeekHandicap[user.id] ?? 0, shown = myStart < 0 ? `−${-myStart}` : '0';
            return (
              <details className="card handicap-help" open>
                <summary>⚖️ How the handicap works</summary>
                <p>So every week is winnable, not just for the best player. The better you usually score, the further behind you start.</p>
                <ol>
                  <li>Every Monday, each player&apos;s <b>average points per day</b> is worked out from the 4 weeks before (2 days played is enough).</li>
                  <li>Whoever averages the fewest points starts the week on <b>0</b>.</li>
                  <li>Everyone else starts <b>behind</b>: 75% of the extra points they&apos;d usually score in a week compared with them.</li>
                  <li>Then the week plays out as normal: points add on top of your start. The <b>Start</b> column shows where each player began.</li>
                </ol>
                <p className="handicap-me">
                  {myOverride ? <>The admin set your start this week to <b>{shown}</b>.</>
                    : mine && base !== null ? (myStart < 0
                      ? <>You average <b>{mine.perDay.toFixed(1)}</b> points a day and the lowest average is <b>{base.toFixed(1)}</b>, so you started on <b>{shown}</b> ({(mine.perDay - base).toFixed(1)} more a day × 7 days × 75%).</>
                      : <>You have the lowest average ({mine.perDay.toFixed(1)} a day), so you started on <b>0</b>. Everyone else is chasing you!</>)
                    : <>You don&apos;t have 2 days of results from before this week yet, so you started on <b>0</b>.</>}
                </p>
                <p className="muted small">
                  {decides === 'handicap' ? '🏆 This table decides who wins the week.' : '🏆 The real table (This week) decides who wins the week; this one is for bragging rights.'}
                  {' '}The admin can set anyone&apos;s start by hand in League settings.
                </p>
              </details>
            );
          })()}
          <p className="muted small">
            {view !== 'all' ? `Week of ${weekLabel(thisWeek)}. Resets every Monday; top on Sunday night wins the week. ` : ''}
            {view === 'handicap' && <>⚖️ Starts are set every Monday (see How the handicap works). </>}
            {league.handicap_on && view !== 'all' && <>🏆 The <b>{decides === 'handicap' ? 'Handicap' : 'This week'}</b> table decides the weekly winner. </>}
            Each game, each day: 1st {POINTS[0]} pts, then {POINTS.slice(1).join(', ')}, and 1 for playing. Today&apos;s games reset at midnight.
            {' '}Results count from the day you joined. {rules.join(' ')}
          </p>
          {recap && !recapOpen && (
            <details className="recap-fold">
              <summary>📰 Last week&apos;s recap</summary>
              <WeeklyRecap recap={recap} league={league} me={user.id} />
            </details>
          )}
        </div>

        <div>
          <div className="daynav">
            <Link href={href({ date: addDays(date, -1) })} aria-label="Previous day">←</Link>
            <h2>{date === today ? "Today's results" : prettyDate(date)}</h2>
            {date < today ? <Link href={href({ date: addDays(date, 1) })} aria-label="Next day">→</Link> : <span />}
          </div>
          {(() => {
            const played = gameList.filter((g) => dayScores.some((x) => x.game_id === g.id));
            const empty = gameList.filter((g) => !dayScores.some((x) => x.game_id === g.id));
            return (<>
          {played.length === 0 && <p className="muted small">No results{date === today ? ' yet today' : ' that day'}.</p>}
          <div className="boards">
          {played.map((g) => {
            const entries = dayScores.filter((s) => s.game_id === g.id);
            const ranked = rankDay(entries, g.higherBetter, weights[g.id] ?? 1);
            entries.sort((a, b) => ranked.get(a.user_id).rank - ranked.get(b.user_id).rank);
            const waiting = date === today ? members.filter((m) => !entries.some((e) => e.user_id === m.id)) : [];
            return (
              <section className="card game-board" key={g.id}>
                <div className="game-board-head">
                  <h3>{g.emoji} {g.name}{g.type === 'count' && g.unit && <small className="muted"> ({g.unit})</small>}{weights[g.id] > 1 && <small className="muted"> ×{weights[g.id]}</small>}</h3>
                  {date === today && !mineToday.has(g.id) && g.url && <a className="btn small" href={g.url} target="_blank" rel="noreferrer" aria-label={`Play ${g.name}`}>↗</a>}
                </div>
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
                          <b className="board-score" title={formatScore(g, s.score)}>{shortScore(g, s.score)}</b>
                          <details className="flag">
                            <summary className={f ? 'raised' : ''} title="Check or query this result" aria-label={`Check ${byId[s.user_id].display_name}'s result`}>⚑{f ? <small>{f.n}</small> : null}</summary>
                            <div className="flag-panel">
                              {s.manual && <p className="small">{s.pasted ? '✍️ Edited after pasting, so it can\'t be verified.' : '✍️ Typed by hand, so it can\'t be verified.'}</p>}
                              {f && <p className="small queried">Queried by {f.n} player{f.n === 1 ? '' : 's'}.</p>}
                              {pastes[s.id] ? <pre>{pastes[s.id]}</pre> : <p className="muted small">Nothing was pasted for this result.</p>}
                              {proofs.has(s.id) && <p className="small"><ProofLink scoreId={s.id} className="">📷 See screenshot</ProofLink></p>}
                              <form className="row">
                                <input type="hidden" name="league" value={league.id} />
                                <input type="hidden" name="score" value={s.id} />
                                <input type="hidden" name="back" value={href({})} />
                                {s.user_id !== user.id && !f?.mine && <button className="btn small" formAction={queryScore}>⚑ Query this result</button>}
                                {f?.mine && <span className="muted small">You&apos;ve queried this.</span>}
                                {isOwner && f && <button className="btn small" formAction={keepScore}>Keep it</button>}
                              </form>
                              {isOwner && (
                                <form action={removeScore} className="stack penalty-form">
                                  <input type="hidden" name="league" value={league.id} />
                                  <input type="hidden" name="score" value={s.id} />
                                  <input type="hidden" name="back" value={href({})} />
                                  <label className="small">Penalty for {byId[s.user_id].display_name}
                                    <select name="penalty" defaultValue="none">
                                      <option value="none">None, just remove the result</option>
                                      <option value="ban">Banned from {g.name} tomorrow</option>
                                      <option value="points5">Minus 5 points this week</option>
                                      <option value="points10">Minus 10 points this week</option>
                                    </select>
                                  </label>
                                  <input name="reason" maxLength={140} placeholder="Reason (optional, everyone sees it)" aria-label="Reason" />
                                  <Submit className="btn small danger">Remove from league</Submit>
                                  <p className="muted small">The result stops counting here, and {byId[s.user_id].display_name} and the league are told.</p>
                                </form>
                              )}
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
                    <span className="muted small grow">⏳ {waiting.map((m) => m.display_name).join(', ')}</span>
                    {waiting.some((m) => m.id !== user.id) && <Submit className="link" aria-label={`Remind them to play ${g.name}`}>⏰</Submit>}
                  </form>
                )}
              </section>
            );
          })}
          </div>
          {empty.length > 0 && (
            <section className="card still-to-play">
              <h3>{date === today ? 'Nobody has played yet' : 'Nobody played'}</h3>
              <ul>
                {empty.map((g) => (
                  <li key={g.id}>
                    <span className="grow">{g.emoji} {g.name}{weights[g.id] > 1 && <small className="muted"> ×{weights[g.id]}</small>}</span>
                    {date === today && <>
                      <form action={nudge}>
                        <input type="hidden" name="league" value={league.id} />
                        <input type="hidden" name="game" value={g.id} />
                        <Submit className="link" aria-label={`Remind everyone to play ${g.name}`}>⏰ Remind</Submit>
                      </form>
                      {g.url && <a className="btn small" href={g.url} target="_blank" rel="noreferrer">Play ↗</a>}
                    </>}
                  </li>
                ))}
              </ul>
            </section>
          )}
            </>);
          })()}
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
          {broken.length > 0 && (
            <section className="card">
              <h3>📣 Records broken</h3>
              <ul className="records-broken">
                {broken.map((e) => {
                  const g = games[e.game_id];
                  return (
                    <li key={e.id}>
                      <span className="grow">
                        {e.kind === 'best' ? '🏆' : '🤡'} <b>{e.display_name}</b>{' '}
                        {e.kind === 'best' ? 'set the best ever' : 'set the worst ever'} {g?.name ?? e.game_id}: <b>{g ? formatScore(g, Number(e.score)) : e.score}</b>
                        <small className="muted"> · {prettyDate(e.play_date)}{e.prev_name ? ` · old record ${g ? formatScore(g, Number(e.prev_score)) : e.prev_score} by ${e.prev_name}` : ''}</small>
                      </span>
                      {e.kind === 'worst' && (e.user_id === user.id || e.laughed
                        ? <span className="muted small" title="Laughs">😂 {e.laughs}</span>
                        : (
                          <form action={laughRecord}>
                            <input type="hidden" name="event" value={e.id} />
                            <button className="btn small" title="Laugh at this record low">😂 {e.laughs || 'Laugh'}</button>
                          </form>
                        ))}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
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
          </div>
          <details className="records-more">
            <summary>Records for each game ({records.perGame.filter((r) => planned(r.game.id)).length})</summary>
          <div className="grid records">
            {records.perGame.filter((r) => planned(r.game.id)).map((r) => (
              <section className="card" key={r.game.id}>
                <h3>{r.game.emoji} {r.game.name}</h3>
                <dl>
                  {r.best && <><dt>{bestWorstLabels(r.game)[0]}</dt><dd><b>{formatScore(r.game, r.best.value)}</b> {names(r.best)} <small className="muted">{prettyDate(r.best.extra)}</small></dd></>}
                  {r.worst && <><dt>{bestWorstLabels(r.game)[1]}</dt><dd><b>{formatScore(r.game, r.worst.value)}</b> {names(r.worst)} <small className="muted">{prettyDate(r.worst.extra)}</small></dd></>}
                  {r.average && <><dt>Best average</dt><dd><b>{formatAvg(r.game, r.average.value)}</b> {names(r.average)}</dd></>}
                  {r.wins && <><dt>Most days won</dt><dd><b>{r.wins.value}</b> {names(r.wins)}</dd></>}
                  {r.streak && <><dt>Longest streak</dt><dd><b>{r.streak.value} day{r.streak.value === 1 ? '' : 's'}</b> {names(r.streak)}</dd></>}
                </dl>
              </section>
            ))}
          </div>
          </details>
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
              <p className="muted small">Changes start tomorrow, so anything already posted today still counts. <b>10 games max</b> per league, so it never feels like a chore.</p>
              <div className="checks weights">
                {gameOptions.map((g) => (
                  <span key={g.id} className="check">
                    <label className="check grow">
                      <input type="checkbox" name="games" value={g.id} defaultChecked={!!planned(g.id)} /> {g.emoji} {g.name}
                      {startsTomorrow.includes(g.id) && <small className="muted"> · starts tomorrow</small>}
                      {stopsTonight.includes(g.id) && <small className="muted"> · stops after today</small>}
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
            <fieldset>
              <legend>⚖️ Handicap</legend>
              <label className="check"><input type="checkbox" name="handicap_on" defaultChecked={league.handicap_on} /> Show a Handicap table: the more points a day you usually score, the further behind you start the week</label>
              <label>Weekly winner from
                <select name="winner_table" defaultValue={league.winner_table}>
                  <option value="scratch">The real table (This week)</option>
                  <option value="handicap">The Handicap table</option>
                </select>
              </label>
              <p className="muted small">Starting scores are worked out every Monday from each player&apos;s average points per day over the 4 weeks before (minus 75% of the weekly gap to whoever scores least). To set one yourself, type how many points behind they start (0–500); leave it empty for the automatic one.</p>
              <div className="handicap-grid">
                {members.map((m) => {
                  const o = overrides.find((x) => x.user_id === m.id);
                  return (
                    <label key={m.id} className="row">
                      <span className="grow">{m.display_name} <small className="muted">auto {autoNow[m.id] ? `−${-autoNow[m.id]}` : '0'}</small></span>
                      <span className="muted">−</span>
                      <input name={`hc_${m.id}`} type="number" min="0" max="500" inputMode="numeric" defaultValue={o ? o.weekly : ''} placeholder="auto" aria-label={`Points ${m.display_name} starts behind`} />
                    </label>
                  );
                })}
              </div>
            </fieldset>
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
