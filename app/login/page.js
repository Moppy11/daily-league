import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { login } from '../actions';
import { Flash } from '../ui';

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' ? sp.next : '/';
  if (await getUser()) redirect('/');
  return (
    <section className="card narrow">
      <h1>Log in</h1>
      <Flash sp={sp} />
      <form action={login} className="stack">
        <input type="hidden" name="next" value={next} />
        <label>Username
          <input name="username" required autoCapitalize="none" autoComplete="username" />
        </label>

        <label>Password
          <input name="password" type="password" required minLength={1} autoComplete="current-password" />
        </label>
        <button className="btn primary">Log in</button>
      </form>
      <p className="muted">New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </section>
  );
}
