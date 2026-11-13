import Link from 'next/link';
import { GAMES } from '@/lib/games';
import { POINTS } from '@/lib/points';
import TryPaste from './TryPaste';

const EXAMPLE = [
  ['Sam', 21, 9, 24, 152], ['Priya', 21, 7, 17, 139], ['Jordan', 19, 4, 10, 118], ['Alex', 14, 1, 3, 77],
];

export default function Landing({ example }) {
  return (
    <div className="landing">
      <section className="hero">
        <h1>One league for all your daily games</h1>
        <p>
          Post your Krillion, Wordle, Connections and other daily results, earn points against your
          friends every day, and win the week.
        </p>
        <div className="row center">
          <Link className="btn primary" href="/signup">Create an account</Link>
          <Link className="btn" href="/login">Log in</Link>
        </div>
      </section>

      <div className="cols">
        <section>
          <h2>Try it: paste a result</h2>
          <p className="muted">Tap Share in a game, paste it here, and see how it&apos;s read. Nothing is saved.</p>
          <TryPaste example={example} />
        </section>
        <section>
          <h2>What a league looks like</h2>
          <p className="muted">An example weekly table. It resets every Monday.</p>
          <div className="card table-wrap league-table">
            <table>
              <thead><tr><th>Position</th><th className="left">Player</th><th>Played</th><th>Wins</th><th>Today</th><th>Points</th></tr></thead>
              <tbody>
                {EXAMPLE.map(([name, played, wins, todayPts, pts], i) => (
                  <tr key={name}>
                    <td className="pos-cell">{i + 1}</td><td className="left">{name}</td><td>{played}</td><td>{wins}</td>
                    <td className="plus-cell">+{todayPts}</td><td className="pts-cell">{pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <h2>How scoring works</h2>
      <section className="card prose">
        <p>
          Every game is ranked on its own, every day. A 3/6 Wordle is only ever compared with your friends&apos; Wordles,
          never with a Krillion score, so games with completely different scoring sit side by side fairly.
        </p>
        <ul>
          <li>Each game, each day: 1st gets {POINTS[0]} points, then {POINTS.slice(1).join(', ')}, and anyone else who played gets 1. Ties share the better place.</li>
          <li>Points from every game add up into the league table. It resets every Monday; whoever is top on Sunday night wins the week.</li>
          <li>Results are checked against today&apos;s puzzle and the game&apos;s own share format, then locked. Typed or edited results are marked as unverified for everyone to see.</li>
          <li>League admins can make a game count double, cap how many results score each day, or drop each player&apos;s worst day.</li>
        </ul>
      </section>

      <h2 id="games">Games we read automatically</h2>
      <div className="game-pills">
        {GAMES.map((g) => <span key={g.id} className="play-chip">{g.emoji} {g.name}</span>)}
      </div>
      <p className="muted small">Any other daily game can be added by hand; those scores are typed in and marked unverified.</p>

      <ul className="features">
        <li><b>Leagues with friends.</b> Invite people with a link. Chat, game requests and reminders built in.</li>
        <li><b>Weekly races.</b> Weekly winners, all-time standings and league records.</li>
        <li><b>Your stats.</b> Averages, bests, streaks, badges and history for every game you play.</li>
        <li><b>Works like an app.</b> Add it to your home screen and switch on notifications.</li>
      </ul>
    </div>
  );
}
