import Link from 'next/link';
import { addFriend, respondFriend } from './actions';
import Submit from './Submit';

// The right friend action for how the viewer and this player are connected.
export default function FriendButton({ viewer, person, rel, back, small = false }) {
  const size = small ? ' small' : '';
  if (!viewer) {
    return <Link className={'btn primary' + size} href={`/signup?next=${encodeURIComponent(back)}`}>Sign up to add</Link>;
  }
  if (rel === 'self') return null;
  if (rel === 'friends') return <span className="tag ok">Friends ✓</span>;
  if (rel === 'outgoing') return <span className="tag">Request sent</span>;
  if (rel === 'incoming') {
    return (
      <form action={respondFriend}>
        <input type="hidden" name="from" value={person.id} />
        <input type="hidden" name="back" value={back} />
        <Submit className={'btn primary' + size} name="answer" value="accept">Accept request</Submit>
      </form>
    );
  }
  return (
    <form action={addFriend}>
      <input type="hidden" name="username" value={person.username} />
      <input type="hidden" name="back" value={back} />
      <Submit className={'btn primary' + size}>Add friend</Submit>
    </form>
  );
}
