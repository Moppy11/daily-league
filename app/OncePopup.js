'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dismissFlag } from './actions';

// A pop-up shown once: closing it (or following its link) records `flag` so it never comes back.
export default function OncePopup({ flag, title, children, link = null, tone = 'good', layer = 58 }) {
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  const router = useRouter();
  if (!open) return null;
  const close = (href) => {
    setOpen(false);
    const f = new FormData(); f.set('key', flag);
    start(async () => { await dismissFlag(f); if (href) router.push(href); });
  };
  return (
    <div className="moment-backdrop" style={{ zIndex: layer }} role="dialog" aria-modal="true" aria-label={title}>
      <div className={'moment card once ' + tone}>
        <p className="moment-body">{title}</p>
        <div className="once-text">{children}</div>
        <div className="row moment-actions">
          {link && <button type="button" className="btn" onClick={() => close(link.href)}>{link.label}</button>}
          <button type="button" className="btn primary" onClick={() => close(null)}>Got it</button>
        </div>
      </div>
    </div>
  );
}
