'use client';
import { useEffect, useState } from 'react';

// A switch between light and dark. Until it's used, the site follows the device's own setting; once used, the
// choice is saved on this device and set on <html data-theme> (see the script in layout.js, which applies it
// before the page paints so there's no flash).
export default function ThemeToggle() {
  const [dark, setDark] = useState(null);           // null until we know, so the server and browser agree
  useEffect(() => {
    const set = document.documentElement.dataset.theme;
    setDark(set ? set === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);
  function flip() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
  }
  return (
    <button type="button" role="switch" aria-checked={dark === true} aria-label="Dark mode" title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="theme-switch" onClick={flip}>
      <span className="knob" aria-hidden="true">{dark ? '🌙' : '☀️'}</span>
    </button>
  );
}
