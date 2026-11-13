import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { isSiteAdmin } from '@/lib/admin';
import { addDays, prettyDate } from '@/lib/dates';
import SignupChart from './SignupChart';

export const metadata = { title: 'Admin · Daily League', robots: { index: false, follow: false } };

const DAYS = 30;

export default async function Admin({ searchParams }) {
  const user = await getUser();
  // Anyone else gets the ordinary "page not found", so the page doesn't advertise itself.
  if (!isSiteAdmin(user)) notFound();
  const sp = await searchParams;
  const term = typeof sp.q === 'string' ? sp.q.trim().slice(0, 60) : '';

  const today = new Date().toISOString().slice(0, 10);
  const [totals, perDay, users] = await Promise.all([
    q(`select
         (select count(*) from users) as accounts,
         (select count(*) from users where email is not null) as with_email,
         (select count(*) from users where created_at > now() - interval '7 days') as new_week,
         (select count(distinct user_id) from scores where created_at > now() - interval '7 days') as active_week,
         (select count(*) from leagues) as leagues,
         (select count(*) from scores where created_at::date = current_date) as results_today`),
    q(`select (created_at at time zone 'UTC')::date as day, count(*) as n from users
       where created_at >= (current_date - $1::int) group by 1`, [DAYS - 1]),
    q(`select u.id, u.username, u.display_name, u.email, u.created_at,
         (select count(*) from scores s where s.user_id = u.id) as results,
         (select max(play_date) from scores s where s.user_id = u.id) as last_played,
         (select count(*) from league_members m where m.user_id = u.id) as leagues
       from users u
       where $1 = '' or u.username ilike $2 or u.display_name ilike $2 or u.email ilike $2
       order by u.created_at desc limit 500`,
      [term, '%' + term.replace(/[\\%_]/g, '\\$&') + '%']),
  ]);
  const t = totals[0];
  const counts = Object.fromEntries(perDay.map((r) => [r.day, r.n]));
  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = addDays(today, i - DAYS + 1);
    return { date, n: counts[date] ?? 0 };
  });
  const pct = t.accounts ? Math.round((t.with_email / t.accounts) * 100) : 0;

  return (
    <>
      <div className="headline">
        <div>
          <h1>Admin</h1>
          <p className="muted">Only you can see this page. It lists every account on the site.</p>
        </div>
        <a className="btn" href="/admin/users.csv">Download CSV</a>
      </div>

      <div className="stats admin-stats">
        <div><b>{t.accounts}</b><small>accounts</small></div>
        <div><b>{t.new_week}</b><small>new in 7 days</small></div>
        <div><b>{t.active_week}</b><small>posted in 7 days</small></div>
        <div><b>{t.with_email}</b><small>with email ({pct}%)</small></div>
        <div><b>{t.leagues}</b><small>leagues</small></div>
        <div><b>{t.results_today}</b><small>results today</small></div>
      </div>

      <h2>Sign-ups per day, last {DAYS} days</h2>
      <section className="card">
        <SignupChart days={days} />
        <details>
          <summary>Show as a table</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th className="left">Day</th><th>Sign-ups</th></tr></thead>
              <tbody>{[...days].reverse().map((d) => <tr key={d.date}><td className="left">{prettyDate(d.date)}</td><td>{d.n}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>

      <h2>Accounts {term && <small className="muted">matching “{term}”: {users.length}</small>}</h2>
      <form action="/admin" method="get" className="card row" role="search">
        <input className="grow" name="q" defaultValue={term} placeholder="Search username, name or email" aria-label="Search accounts" autoCapitalize="none" />
        <button className="btn primary">Search</button>
        {term && <Link className="btn" href="/admin">Clear</Link>}
      </form>
      <div className="card table-wrap">
        <table className="admin-users">
          <thead>
            <tr><th className="left">Username</th><th className="left">Name</th><th className="left">Email</th><th className="left">Joined</th><th>Results</th><th>Leagues</th><th className="left">Last played</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="left"><Link href={`/u/${u.username}`}>@{u.username}</Link></td>
                <td className="left">{u.display_name}</td>
                <td className="left">{u.email ?? <span className="muted">none</span>}</td>
                <td className="left">{prettyDate(new Date(u.created_at).toISOString().slice(0, 10))}</td>
                <td>{u.results}</td>
                <td>{u.leagues}</td>
                <td className="left">{u.last_played ? prettyDate(u.last_played) : <span className="muted">never</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="muted">No accounts match.</p>}
      </div>
      {users.length === 500 && <p className="muted small">Showing the newest 500. Search or download the CSV for the rest.</p>}
    </>
  );
}
