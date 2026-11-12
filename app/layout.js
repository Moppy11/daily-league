import './globals.css';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
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
  return (
    <html lang="en">
      <body>
        <TzSync />
        <header className="top">
          <Link href="/" className="brand">🏆 Daily League</Link>
          {user && <LogoutButton />}
        </header>
        <main>{children}</main>
        {user && <Nav username={user.username} />}
      </body>
    </html>
  );
}
