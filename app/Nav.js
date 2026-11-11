'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  ['/', '📅', 'Today'],
  ['/leagues', '🏆', 'Leagues'],
  ['/games', '🎮', 'Games'],
  ['/friends', '👥', 'Friends'],
  ['/me', '📈', 'Stats'],
];

export default function Nav({ username }) {
  const path = usePathname();
  const active = (href) =>
    href === '/' ? path === '/' : href === '/me' ? path === `/u/${username}` : path.startsWith(href);
  return (
    <nav className="tabs" aria-label="Main">
      {ITEMS.map(([href, icon, label]) => (
        <Link key={href} href={href} className={active(href) ? 'on' : ''} aria-current={active(href) ? 'page' : undefined}>
          <span aria-hidden="true">{icon}</span>{label}
        </Link>
      ))}
    </nav>
  );
}
