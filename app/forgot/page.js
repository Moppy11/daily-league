import Link from 'next/link';
import { requestReset } from '../actions';
import { emailEnabled } from '@/lib/email';
import { Flash } from '../ui';
import Submit from '../Submit';

export default async function Forgot({ searchParams }) {
  const sp = await searchParams;
  return (
    <section className="card narrow">
      <h1>Forgot your password?</h1>
      <Flash sp={sp} />
      {emailEnabled() ? (
        <form action={requestReset} className="stack">
          <p className="muted">We&apos;ll email you a link to choose a new one.</p>
          <label>Username or email<input name="who" required autoCapitalize="none" autoComplete="username" /></label>
          <Submit>Send reset link</Submit>
        </form>
      ) : (
        <p className="muted">Reset by email isn&apos;t switched on yet. If you saved a recovery code, you can use that.</p>
      )}
      <p className="muted"><Link href="/reset">Use a recovery code instead</Link> · <Link href="/login">Back to log in</Link></p>
    </section>
  );
}
