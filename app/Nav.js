'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  ['/', '📅', 'Today'],
  ['/leagues', '🏆', 'Leagues'],
  ['/games', '🎮', 'Games'],
  ['/friends', '👥', 'Friends'],
  ['/notifications', '🔔', 'Alerts'],
  ['/me', '📈', 'Stats'],
];

export default function Nav({ username, alerts = 0 }) {
  const path = usePathname();
  const active = (href) =>
    href === '/' ? path === '/' : href === '/me' ? path === `/u/${username}` : path.startsWith(href);
  return (
    <nav className="tabs" aria-label="Main">
      {ITEMS.map(([href, icon, label]) => (
        <Link key={href} href={href} prefetch={href === '/notifications' ? false : undefined} className={active(href) ? 'on' : ''} aria-current={active(href) ? 'page' : undefined}>
          <span aria-hidden="true">{icon}</span>{label}
          {href === '/notifications' && alerts > 0 && !active(href) && <b className="badge" aria-label={`${alerts} new`}>{alerts > 9 ? '9+' : alerts}</b>}
        </Link>
      ))}
    </nav>
  );
}
