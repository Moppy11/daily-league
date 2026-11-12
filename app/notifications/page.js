import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser, userToday } from '@/lib/auth';
import { remainingToday } from '@/lib/notify';
import { ago } from '@/lib/dates';

const ICON = { score: '📊', chat: '💬', request: '🎮', nudge: '⏰', friend: '👥', join: '🏆', invite: '✉️' };

export default async function Notifications() {
  const user = await requireUser('/notifications');
  const items = await q(
    'select id, kind, body, link, created_at, read_at from notifications where user_id = $1 order by id desc limit 60',
    [user.id]
  );
  // Opening the page marks everything as read; this render still shows what was new.
  await q('update notifications set read_at = now() where user_id = $1 and read_at is null', [user.id]);
  const left = await remainingToday(user.id, await userToday());

  return (
    <>
      <h1>Notifications</h1>
      {left.length > 0 && (
        <Link href="/" className="card notice">
          <span>
            ⏰ <b>{left.length} game{left.length === 1 ? '' : 's'} still to post today:</b>{' '}
            {left.map((g) => g.name).join(', ')}
          </span>
          <span>→</span>
        </Link>
      )}
      {items.length === 0 && <p className="muted">Nothing yet. You&apos;ll see league-mates&apos; scores, chat, game requests and reminders here.</p>}
      <div className="notifs">
        {items.map((n) => (
          <Link href={n.link} className={'card list-row' + (n.read_at ? '' : ' unread')} key={n.id}>
            <span className="emoji">{ICON[n.kind] ?? '🔔'}</span>
            <span className="grow">{n.body}<small className="muted">{ago(n.created_at)}</small></span>
            {!n.read_at && <span className="dot" aria-label="New" />}
          </Link>
        ))}
      </div>
      <p className="muted small">Notifications appear here in the app. They aren&apos;t sent to your phone or email.</p>
    </>
  );
}
