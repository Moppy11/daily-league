import Link from 'next/link';
import { q, q1 } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { deleteAccount, unblockUser } from '../actions';
import { Flash } from '../ui';
import Submit from '../Submit';
import RecoveryCode from './RecoveryCode';

export default async function Settings({ searchParams }) {
  const sp = await searchParams;
  const user = await requireUser('/settings');
  const row = await q1('select recovery_hash is not null as has_code from users where id = $1', [user.id]);

  const blocked = await q('select u.id, u.display_name, u.username from blocks b join users u on u.id = b.blocked_id where b.user_id = $1 order by u.display_name', [user.id]);

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Signed in as <b>@{user.username}</b></p>
      <Flash sp={sp} />

      <h2>Password recovery</h2>
      <section className="card">
        <p className="muted">
          Accounts have no email address, so a recovery code is the only way back in if you forget your password.
          Use it on the <Link href="/reset">reset page</Link>.
        </p>
        <RecoveryCode hasCode={row.has_code} />
      </section>

      <h2>Privacy</h2>
      <p className="card muted">Choose who can see your stats on <Link href="/me">your stats page</Link>.</p>

      <h2>Blocked players</h2>
      {blocked.length === 0 && <p className="card muted">Nobody is blocked. You can block someone from their profile; their chat messages are hidden from you and they can&apos;t send you friend requests or challenges.</p>}
      <div className="list">
        {blocked.map((b) => (
          <form action={unblockUser} className="card list-row" key={b.id}>
            <input type="hidden" name="user" value={b.id} />
            <span className="grow"><b>{b.display_name}</b><small className="muted">@{b.username}</small></span>
            <Submit className="btn small">Unblock</Submit>
          </form>
        ))}
      </div>

      <h2>Delete account</h2>
      <details className="card">
        <summary>Delete my account and everything I&apos;ve posted</summary>
        <form action={deleteAccount} className="stack">
          <p className="muted">
            This permanently removes your account, scores, messages and friendships. Leagues you run pass to
            their longest-standing member. It can&apos;t be undone.
          </p>
          <label>Your password<input name="password" type="password" required autoComplete="current-password" /></label>
          <Submit className="btn danger">Delete my account</Submit>
        </form>
      </details>
    </>
  );
}
