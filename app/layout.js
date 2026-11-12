import './globals.css';
import Link from 'next/link';
import { getUser, userToday, userHour } from '@/lib/auth';
import { unreadCount, remainingToday } from '@/lib/notify';
import LogoutButton from './LogoutButton';
import TzSync from './TzSync';
import Nav from './Nav';

export const metadata = {
  title: 'Daily League',
  description: 'Compete with friends across your daily games.',
};
export const viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }) {
  const user = await getUser();
  let alerts = 0;
  if (user) {
    alerts = await unreadCount(user.id);
    // From 6pm, games still to post count as one more alert.
    if ((await userHour()) >= 18 && (await remainingToday(user.id, await userToday())).length) alerts++;
  }
  return (
    <html lang="en">
      <body>
        <TzSync />
        <header className="top">
          <Link href="/" className="brand">🏆 Daily League</Link>
          {user && <Nav username={user.username} alerts={alerts} />}
          {user && <LogoutButton />}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
