import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { detectGame, formatScore } from '@/lib/games';
import { submitScore } from '../actions';
import Submit from '../Submit';
import PasteBox from '../PasteBox';

// Where a result lands when it is shared to Daily League from a game's Share button,
// and a quick "paste anything" box that works out the game for you.
export default async function Share({ searchParams }) {
  const sp = await searchParams;
  const pick = (k) => (typeof sp[k] === 'string' ? sp[k] : '');
  // Phones often split a shared result into text and a separate link.
  const text = [pick('text'), pick('url')].filter(Boolean).join('\n').slice(0, 2000) || pick('title').slice(0, 2000);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === 'string')).toString();
  await requireUser('/share' + (qs ? `?${qs}` : ''));
  const found = text ? detectGame(text) : null;

  return (
    <section className="card narrow">
      <h1>Post a result</h1>
      {found ? (
        <form action={submitScore} className="stack">
          <p>This looks like <b>{found.game.emoji} {found.game.name}</b>: <b>{formatScore(found.game, found.score)}</b></p>
          <input type="hidden" name="game" value={found.game.id} />
          <textarea name="text" rows={6} readOnly defaultValue={text} aria-label="Shared result" />
          <input type="hidden" name="edited" value={sp.edited === '1' ? '1' : '0'} />
          {sp.edited === '1' && <small className="edit-warn">✍️ This was changed after pasting, so it will be marked as edited for your league.</small>}
          <Submit>Post score</Submit>
        </form>
      ) : (
        <form action="/share" method="get" className="stack">
          {text && <p className="flash err">That doesn&apos;t match any game&apos;s result. Share or paste the whole result, unedited.</p>}
          <PasteBox rows={6} required placeholder="Paste any game's result and we'll work out which game it is" label="Result" />
          <button className="btn primary">Check result</button>
        </form>
      )}
      <p className="muted"><Link href="/">Back to today</Link></p>
    </section>
  );
}
