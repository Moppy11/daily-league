import { NextResponse } from 'next/server';

// The site lives at dailyleague.vercel.app. Vercel's first address for the project, daily-league-alpha.vercel.app,
// still reaches it, so anyone who opens that address is sent to the same page on the clean one.
const OLD_HOSTS = new Set(['daily-league-alpha.vercel.app']);
const HOME = 'dailyleague.vercel.app';

export function middleware(req) {
  const host = (req.headers.get('host') || '').toLowerCase();
  if (!OLD_HOSTS.has(host)) return NextResponse.next();
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${HOME}`);
  return NextResponse.redirect(url, 308);
}

export const config = { matcher: '/:path*' };
