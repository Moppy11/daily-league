import Link from 'next/link';
import { q, q1 } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { deleteAccount, unblockUser, setEmail } from '../actions';
import { Flash } from '../ui';
import Submit from '../Submit';
import RecoveryCode from './RecoveryCode';
import PushToggle from './PushToggle';
import { vapidKeys } from '@/lib/push';

export default async function Settings({ searchParams }) {
  const sp = await searchParams;
  const user = await requireUser('/settings');
  const row = await q1('select recovery_hash is not null as has_code, email from users where id = $1', [user.id]);

  const blocked = await q('select u.id, u.display_name, u.username from blocks b join users u on u.id = b.blocked_id where b.user_id = $1 order by u.display_name', [user.id]);

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Signed in as <b>@{user.username}</b></p>
      <Flash sp={sp} />

      <h2>Email</h2>
      <section className="card">
        <p className="muted">
          {row.email ? <>Your email is <b>{row.email}</b>. It&apos;s used for password reset links and is never shown to other players.</>
            : <>You haven&apos;t added an email yet. Add one so you can reset your password if you forget it.</>}
        </p>
        <form action={setEmail} className="stack">
          <label>{row.email ? 'New email' : 'Email'}<input name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" /></label>
          <label>Your password<input name="password" type="password" required autoComplete="current-password" /></label>
          <Submit className="btn">{row.email ? 'Change email' : 'Add email'}</Submit>
        </form>
      </section>

      <h2>Notifications on this device</h2>
      <section className="card"><PushToggle publicKey={(await vapidKeys()).publicKey} /></section>

      <h2>Recovery code (backup)</h2>
      <section className="card">
        <p className="muted">
          A backup way back in if you forget your password and can&apos;t get to your email.
          Use it on the <Link href="/reset">recovery code page</Link>.
        </p>
        <RecoveryCode hasCode={row.has_code} />
      </section>

      <h2>Privacy</h2>
      <p className="card muted">Choose who can see your stats on <Link href="/me">your stats page</Link>. Read the <Link href="/privacy">privacy policy</Link>.</p>

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
