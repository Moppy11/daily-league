import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { login } from '../actions';
import { Flash } from '../ui';
import Submit from '../Submit';

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' ? sp.next : '/';
  if (await getUser()) redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
  return (
    <section className="card narrow">
      <h1>Log in</h1>
      <Flash sp={sp} />
      <form action={login} className="stack">
        <input type="hidden" name="next" value={next} />
        <label>Username or email
          <input name="username" required autoCapitalize="none" autoComplete="username" />
        </label>

        <label>Password
          <input name="password" type="password" required minLength={1} autoComplete="current-password" />
        </label>
        <Submit>Log in</Submit>
      </form>
      <p className="muted"><Link href="/forgot">Forgot your password?</Link></p>
      <p className="muted">New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </section>
  );
}
