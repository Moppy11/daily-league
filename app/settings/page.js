import Link from 'next/link';
import { q1 } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { deleteAccount } from '../actions';
import { Flash } from '../ui';
import Submit from '../Submit';
import RecoveryCode from './RecoveryCode';

export default async function Settings({ searchParams }) {
  const sp = await searchParams;
  const user = await requireUser('/settings');
  const row = await q1('select recovery_hash is not null as has_code from users where id = $1', [user.id]);

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
