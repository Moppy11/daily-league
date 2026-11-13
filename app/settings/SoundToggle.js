'use client';
import { useEffect, useState } from 'react';

// Per-device switch for the alert chime (kept in this browser only).
export default function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => { try { setOn(localStorage.getItem('alertSound') !== 'off'); } catch {} }, []);
  function change(e) {
    setOn(e.target.checked);
    try { localStorage.setItem('alertSound', e.target.checked ? 'on' : 'off'); } catch {}
  }
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={change} /> Play a chime when a new alert arrives while the site is open
    </label>
  );
}
