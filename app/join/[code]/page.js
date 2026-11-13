import Link from 'next/link';
import { redirect } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { joinLeague } from '../../actions';
import Submit from '../../Submit';

async function findLeague(code) {
  return q1(
    `select l.id, l.name, u.display_name as owner,
       (select count(*) from league_members where league_id = l.id) as players
     from leagues l join users u on u.id = l.owner_id where l.code = $1`,
    [code.toLowerCase()]
  );
}

// The preview shown when the invite link is dropped into WhatsApp, iMessage or Discord.
export async function generateMetadata({ params }) {
  const { code } = await params;
  const league = await findLeague(code);
  if (!league) return { title: 'Invite not found' };
  const title = `Join ${league.name}`;
  const description = `${league.owner} invited you to their Daily League · ${league.players} player${league.players === 1 ? '' : 's'}. Post your daily game results and race your friends each week.`;
  const images = [{ url: '/opengraph-image.jpg', width: 1200, height: 630, alt: 'Daily League' }];
  return { title, description, openGraph: { title, description, images }, twitter: { card: 'summary_large_image', title, description, images } };
}

export default async function Join({ params }) {
  const { code } = await params;
  const league = await findLeague(code);
  if (!league) {
    return <section className="card narrow"><h1>Invite not found</h1><p>This invite link isn&apos;t valid. Ask your friend for a new one.</p></section>;
  }
  const user = await getUser();
  if (user) {
    const member = await q('select 1 from league_members where league_id = $1 and user_id = $2', [league.id, user.id]);
    if (member.length) redirect(`/leagues/${league.id}`);
  }
  const next = encodeURIComponent(`/join/${code}`);
  return (
    <section className="card narrow center-text">
      <p className="muted">You&apos;re invited to</p>
      <h1>🏆 {league.name}</h1>
      <p className="muted">Run by {league.owner} · {league.players} player{league.players === 1 ? '' : 's'}</p>
      {user ? (
        <form action={joinLeague}>
          <input type="hidden" name="code" value={code} />
          <Submit>Join league</Submit>
        </form>
      ) : (
        <div className="row center">
          <Link className="btn primary" href={`/signup?next=${next}`}>Sign up to join</Link>
          <Link className="btn" href={`/login?next=${next}`}>Log in</Link>
        </div>
      )}
    </section>
  );
}
