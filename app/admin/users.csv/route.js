import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { isSiteAdmin } from '@/lib/admin';

// Every account as a spreadsheet. Same access rule as the dashboard.
export async function GET() {
  if (!isSiteAdmin(await getUser())) return new Response('Not found', { status: 404 });
  const rows = await q(
    `select u.username, u.display_name, u.email, u.created_at,
       (select count(*) from scores s where s.user_id = u.id) as results,
       (select max(play_date) from scores s where s.user_id = u.id) as last_played
     from users u order by u.created_at`
  );
  // Quote every cell, and stop a spreadsheet treating a name like "=SUM(...)" as a formula.
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const lines = [['username', 'display_name', 'email', 'joined', 'results', 'last_played'].join(',')];
  for (const r of rows) lines.push([r.username, r.display_name, r.email, r.created_at, r.results, r.last_played].map(cell).join(','));
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="daily-league-accounts-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
