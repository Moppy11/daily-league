'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const ICON = { score: '📊', chat: '💬', request: '🎮', nudge: '⏰', friend: '👥', join: '🏆', invite: '✉️', account: '🔑', duel: '⚔️', flag: '⚑', admin: '🛠️' };
const soundOn = () => { try { return localStorage.getItem('alertSound') !== 'off'; } catch { return true; } };

// Two soft rising notes, made in the browser, so there's no sound file to load.
function chime(ctx) {
  const now = ctx.currentTime;
  [[880, 0], [1318.5, 0.12]].forEach(([freq, at]) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + at); osc.stop(now + at + 0.5);
  });
}

// Checks for new notifications while the site is open. A new one slides in as a banner at the top,
// with a chime, and the Alerts badge updates.
export default function AlertWatcher() {
  const [banner, setBanner] = useState(null);
  const lastId = useRef(null);
  const audio = useRef(null);
  const path = usePathname();
  const router = useRouter();

  // Browsers only allow sound after the person has tapped or clicked the page once.
  useEffect(() => {
    const unlock = () => {
      try {
        audio.current ??= new (window.AudioContext || window.webkitAudioContext)();
        audio.current.resume();
      } catch {}
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  useEffect(() => {
    let stop = false;
    async function check() {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/alerts', { cache: 'no-store' });
        const data = await res.json();
        if (stop || !data.signedIn) return;
        // No notifications yet: start from nothing, so the very first one still gets a banner.
        if (!data.latest) { lastId.current ??= 0; return; }
        const first = lastId.current === null;
        if (!first && data.latest.id > lastId.current && !data.latest.link.startsWith(path === '/' ? '\0' : path)) {
          setBanner(data.latest);
          if (soundOn() && audio.current?.state === 'running') chime(audio.current);
          router.refresh(); // updates the Alerts badge
        }
        lastId.current = Math.max(lastId.current ?? 0, data.latest.id);
      } catch {}
    }
    check();
    const t = setInterval(check, 15000);
    const onShow = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onShow);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [path, router]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  if (!banner) return null;
  return (
    <div className="alert-banner" role="status" aria-live="polite">
      <Link href={banner.link} className="alert-body" onClick={() => setBanner(null)}>
        <span className="alert-icon" aria-hidden="true">{ICON[banner.kind] ?? '🔔'}</span>
        <span>{banner.body}</span>
      </Link>
      <button className="alert-close" onClick={() => setBanner(null)} aria-label="Dismiss">✕</button>
    </div>
  );
}
