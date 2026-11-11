import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { addFriend, respondFriend, removeFriend } from '../actions';
import { Flash } from '../ui';
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

  return (
    <>
      <h1>Friends</h1>
      <p className="muted">Your username is <b>@{user.username}</b>. Friends can see each other&apos;s stats and invite each other to leagues.</p>
      <Flash sp={sp} />
      <form action={addFriend} className="card row">
        <input className="grow" name="username" required placeholder="Friend's username" aria-label="Friend's username" autoCapitalize="none" />
        <Submit>Add friend</Submit>
      </form>

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
