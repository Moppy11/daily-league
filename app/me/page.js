import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export default async function Me() {
  const user = await requireUser('/me');
  redirect(`/u/${user.username}`);
}
