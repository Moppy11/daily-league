import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { respondFriend, removeFriend } from '../actions';
import { Flash } from '../ui';
import CopyLink from '../CopyLink';
import FriendButton from '../FriendButton';
import Submit from '../Submit';

export default async function Friends({ searchParams }) {
  const sp = await searchParams;
  const user = await requireUser('/friends');
  const rows = await q(
    `select f.user_id, f.friend_id, f.status, u.id, u.username, u.display_name
     from friendships f join users u on u.id = case when f.user_id = $1 then f.friend_id else f.user_id end
     where f.user_id = $1 or f.friend_id = $1 order by u.display_name`,
    [user.id]
  );
  const friends = rows.filter((r) => r.status === 'accepted');
  const incoming = rows.filter((r) => r.status === 'pending' && r.friend_id === user.id);
  const outgoing = rows.filter((r) => r.status === 'pending' && r.user_id === user.id);

  // Search by username or display name.
  const term = typeof sp.q === 'string' ? sp.q.trim().replace(/^@/, '').slice(0, 30) : '';
  const found = term.length >= 2
    ? await q(
        `select id, username, display_name from users
         where id <> $1 and (username ilike $2 or display_name ilike $2)
         order by (username = $3) desc, display_name limit 12`,
        [user.id, '%' + term.replace(/[\\%_]/g, '\\$&') + '%', term.toLowerCase()]
      )
    : [];
  const relOf = (id) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return 'none';
    return r.status === 'accepted' ? 'friends' : r.user_id === user.id ? 'outgoing' : 'incoming';
  };
  const back = term ? `/friends?q=${encodeURIComponent(term)}` : '/friends';

  return (
    <>
      <h1>Friends</h1>
      <p className="muted">Your username is <b>@{user.username}</b>. Friends can invite each other to leagues and see each other&apos;s stats.</p>
      <Flash sp={sp} />
      <form action="/friends" method="get" className="card row" role="search">
        <input className="grow" name="q" defaultValue={term} required minLength={2} placeholder="Search by name or username" aria-label="Search players" autoCapitalize="none" />
        <button className="btn primary">Search</button>
      </form>
      {term.length >= 2 && (
        <div className="list">
          {found.length === 0 && <p className="muted">No players match “{term}”. Send them your profile link instead.</p>}
          {found.map((r) => (
            <div className="card list-row" key={r.id}>
              <Link href={`/u/${r.username}`} className="grow"><b>{r.display_name}</b><small className="muted">@{r.username}</small></Link>
              <FriendButton viewer={user} person={r} rel={relOf(r.id)} back={back} small />
            </div>
          ))}
        </div>
      )}
      <div className="card notice plain">
        <span>Or send friends your profile link so they can add you.</span>
        <CopyLink path={`/u/${user.username}`} label="Share my profile" title={`${user.display_name} on Daily League`} className="btn small" />
      </div>

      {incoming.length > 0 && <h2>Requests</h2>}
      <div className="list">
        {incoming.map((r) => (
          <form action={respondFriend} className="card list-row" key={r.id}>
            <input type="hidden" name="from" value={r.id} />
            <span className="grow"><b>{r.display_name}</b><small className="muted">@{r.username}</small></span>
            <Submit className="btn primary small" name="answer" value="accept">Accept</Submit>
            <button className="btn small" name="answer" value="decline">Decline</button>
          </form>
        ))}
      </div>

      <h2>Your friends</h2>
      {friends.length === 0 && <p className="muted">No friends added yet.</p>}
      <div className="list">
        {friends.map((r) => (
          <div className="card list-row" key={r.id}>
            <Link href={`/u/${r.username}`} className="grow"><b>{r.display_name}</b><small className="muted">@{r.username} · stats and head-to-head →</small></Link>
            <form action={removeFriend}>
              <input type="hidden" name="friend" value={r.id} />
              <button className="link" aria-label={`Remove ${r.display_name}`}>Remove</button>
            </form>
          </div>
        ))}
      </div>

      {outgoing.length > 0 && (
        <>
          <h2>Sent</h2>
          <p className="muted">Waiting on {outgoing.map((r) => '@' + r.username).join(', ')}</p>
        </>
      )}
    </>
  );
}
