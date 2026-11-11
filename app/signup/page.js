import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { signup } from '../actions';
import { Flash } from '../ui';
import Submit from '../Submit';

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' ? sp.next : '/';
  if (await getUser()) redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
  return (
    <section className="card narrow">
      <h1>Create your account</h1>
      <Flash sp={sp} />
      <form action={signup} className="stack">
        <input type="hidden" name="next" value={next} />
        <label>Username
          <input name="username" required autoCapitalize="none" autoComplete="username" />
        </label>
        <label>Display name
          <input name="display_name" maxLength={30} placeholder="What friends see" />
        </label>
        <label>Password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        <Submit>Create your account</Submit>
      </form>
      <p className="muted">Already playing? <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></p>
    </section>
  );
}
