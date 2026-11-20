'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { dismissVotePrompt } from './actions';

// Friday to Sunday: a pop-up asking each player to vote on next week's games, until they have voted on every game.
// "Later" puts it away for the rest of the day.
export default function VotePrompt({ prompts }) {
  const path = usePathname();
  if (!prompts.length || /\/vote$/.test(path)) return null;     // never over the voting page itself
  const first = prompts[0];
  return (
    <div className="moment-backdrop" role="dialog" aria-modal="true" aria-label="Games vote">
      <div className="moment card good">
        <p className="moment-body">🗳️ Vote on next week&apos;s games{prompts.length === 1 ? ` in ${first.name}` : ''}!</p>
        <p className="small">
          {prompts.length === 1
            ? `${first.left} of ${first.total} games still need your vote.`
            : `${prompts.map((p) => p.name).join(', ')} all have games waiting for your vote.`}
          {' '}Try any game you don&apos;t know first, so the vote is fair. Two &quot;no&quot; votes and a game is out next week. Voting closes Sunday at 11:59pm.
        </p>
        <div className="row moment-actions">
          <Link className="btn primary" href={`/leagues/${first.id}/vote`}>Vote now</Link>
          <form action={dismissVotePrompt}>
            {prompts.map((p) => <input key={p.id} type="hidden" name="league" value={p.id} />)}
            <button className="btn">Later</button>
          </form>
        </div>
      </div>
    </div>
  );
}
