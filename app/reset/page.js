import Link from 'next/link';
import { resetPassword } from '../actions';
import { Flash } from '../ui';
import Submit from '../Submit';

export default async function Reset({ searchParams }) {
  const sp = await searchParams;
  return (
    <section className="card narrow">
      <h1>Reset your password</h1>
      <p className="muted">You need the recovery code you created in Settings. Without one, a password can&apos;t be reset.</p>
      <Flash sp={sp} />
      <form action={resetPassword} className="stack">
        <label>Username<input name="username" required autoCapitalize="none" autoComplete="username" /></label>
        <label>Recovery code<input name="code" required autoCapitalize="none" autoComplete="off" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx" /></label>
        <label>New password<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
        <Submit>Set new password</Submit>
      </form>
      <p className="muted"><Link href="/forgot">Reset by email instead</Link> · <Link href="/login">Back to log in</Link></p>
    </section>
  );
}
