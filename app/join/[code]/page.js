import Link from 'next/link';
import { redirect } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { joinLeague } from '../../actions';

export default async function Join({ params }) {
  const { code } = await params;
  const league = await q1(
    `select l.id, l.name, u.display_name as owner,
       (select count(*) from league_members where league_id = l.id) as players
     from leagues l join users u on u.id = l.owner_id where l.code = $1`,
    [code.toLowerCase()]
  );
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
          <button className="btn primary">Join league</button>
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
