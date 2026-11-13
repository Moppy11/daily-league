import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';

// The newest notification and the unread count, polled by the alert banner.
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ signedIn: false }, { headers: { 'Cache-Control': 'no-store' } });
  const [latest] = await q(
    'select id, kind, body, link from notifications where user_id = $1 order by id desc limit 1',
    [user.id]
  );
  const [{ n }] = await q('select count(*) as n from notifications where user_id = $1 and read_at is null', [user.id]);
  return Response.json({ signedIn: true, unread: n, latest: latest ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}
