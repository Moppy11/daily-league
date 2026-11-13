import './globals.css';
import Link from 'next/link';
import { getUser, userToday, userHour } from '@/lib/auth';
import { unreadCount, remainingToday } from '@/lib/notify';
import LogoutButton from './LogoutButton';
import TzSync from './TzSync';
import { siteOrigin } from '@/lib/site';
import Nav from './Nav';
import AlertWatcher from './AlertWatcher';

const DESCRIPTION = 'Post your Wordle, Krillion, Connections and other daily game results, earn points against friends every day, and win the week.';

export const metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: 'Daily League', template: '%s · Daily League' },
  description: DESCRIPTION,
  openGraph: { title: 'Daily League', description: DESCRIPTION, siteName: 'Daily League', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Daily League', description: DESCRIPTION },
  appleWebApp: { capable: true, title: 'Daily League', statusBarStyle: 'default' },
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#2f6bff' };

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
        {user && <AlertWatcher />}
        <header className="top">
          <Link href="/" className="brand"><img src="/logo.svg" alt="" width="26" height="26" /> Daily League</Link>
          {user && <Nav username={user.username} alerts={alerts} />}
          {user && <Link href="/settings" className="link" aria-label="Settings" title="Settings">⚙️</Link>}
          {user && <LogoutButton />}
        </header>
        <main>{children}</main>
        <footer className={'foot' + (user ? ' with-nav' : '')}>
          <span>Daily League</span> · <Link href="/privacy">Privacy</Link> · <Link href="/#games">Supported games</Link>
          {!user && <> · <Link href="/signup">Sign up</Link></>}
        </footer>
      </body>
    </html>
  );
}
