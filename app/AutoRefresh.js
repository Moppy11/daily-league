'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-fetches the page every so often while it is on screen, so new chat messages appear.
export default function AutoRefresh({ seconds = 15 }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      const typing = document.activeElement && ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)
        && document.activeElement.value;
      if (document.visibilityState === 'visible' && !typing) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
