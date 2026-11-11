import './globals.css';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { logout } from './actions';
import TzSync from './TzSync';

export const metadata = {
  title: 'Daily League',
  description: 'Compete with friends across your daily games.',
};
export const viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }) {
  const user = await getUser();
  return (
    <html lang="en">
      <body>
        <TzSync />
        <header className="top">
          <Link href="/" className="brand">🏆 Daily League</Link>
          {user && (
            <form action={logout}>
              <button className="link">Log out</button>
            </form>
          )}
        </header>
        <main>{children}</main>
        {user && (
          <nav className="tabs">
            <Link href="/"><span>📅</span>Today</Link>
            <Link href="/leagues"><span>🏆</span>Leagues</Link>
            <Link href="/games"><span>🎮</span>Games</Link>
            <Link href="/friends"><span>👥</span>Friends</Link>
            <Link href="/me"><span>📈</span>Stats</Link>
          </nav>
        )}
      </body>
    </html>
  );
}
