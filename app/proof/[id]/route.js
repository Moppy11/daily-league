import { q1 } from '@/lib/db';
import { getUser, canSee } from '@/lib/auth';

// Serves a result's screenshot to its owner, their friends and their league-mates.
export async function GET(_req, { params }) {
  const { id } = await params;
  const user = await getUser();
  if (!user || !/^\d+$/.test(id)) return new Response('Not found', { status: 404 });
  const row = await q1('select p.mime, p.data, s.user_id from proofs p join scores s on s.id = p.score_id where p.score_id = $1', [Number(id)]);
  if (!row || !(await canSee(user.id, row.user_id))) return new Response('Not found', { status: 404 });
  return new Response(row.data, {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' },
  });
}
