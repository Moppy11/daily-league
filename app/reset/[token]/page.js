import Link from 'next/link';
import { createHash } from 'node:crypto';
import { q1 } from '@/lib/db';
import { resetWithLink } from '../../actions';
import { Flash } from '../../ui';
import Submit from '../../Submit';

export default async function ResetLink({ params, searchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const valid = await q1(
    'select 1 from password_resets where token_hash = $1 and used_at is null and expires > now()',
    [createHash('sha256').update(token).digest('hex')]
  );
  return (
    <section className="card narrow">
      <h1>Choose a new password</h1>
      <Flash sp={sp} />
      {valid ? (
        <form action={resetWithLink} className="stack">
          <input type="hidden" name="token" value={token} />
          <label>New password<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
          <Submit>Save new password</Submit>
        </form>
      ) : (
        <p>This link has expired or already been used. <Link href="/forgot">Ask for a new one</Link>.</p>
      )}
    </section>
  );
}
