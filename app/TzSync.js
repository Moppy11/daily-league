'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Tells the server which time zone the player is in, so "today" means their today.
export default function TzSync() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const current = document.cookie.split('; ').find((c) => c.startsWith('tz='))?.slice(3);
    if (decodeURIComponent(current ?? '') !== tz) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [router]);
  return null;
}
