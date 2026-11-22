'use client';
import { useEffect, useState } from 'react';

// Opens a result's screenshot over the page, with a ✕ to close it. A new tab had no way back in the home-screen app.
export default function ProofLink({ scoreId, children, className = 'link' }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);
  return (
    <>
      <a className={className} href={`/proof/${scoreId}`} onClick={(e) => { e.preventDefault(); setOpen(true); }}>{children}</a>
      {open && (
        <div className="proof-view" role="dialog" aria-modal="true" aria-label="Screenshot" onClick={() => setOpen(false)}>
          <button type="button" className="proof-close" aria-label="Close screenshot" onClick={() => setOpen(false)}>✕</button>
          <img src={`/proof/${scoreId}`} alt="Screenshot of the result" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
