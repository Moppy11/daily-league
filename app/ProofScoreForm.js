'use client';
import { useState } from 'react';
import { submitScore } from './actions';

// For games with no share text (Kabloom): the score is typed in and the game's picture goes with it as proof.
// The picture is shrunk in the browser first, so the upload is small and quick.
export default function ProofScoreForm({ game, name, max }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = form.elements.picture.files?.[0];
    if (!file) { setNote(`Add the ${name} picture first.`); return; }
    setBusy(true); setNote('');
    try {
      const img = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.72));
      const fd = new FormData();
      fd.set('game', game);
      fd.set('manual', form.elements.manual.value);
      fd.set('image', blob, 'proof.jpg');
      await submitScore(fd);              // redirects back with "score saved" or the reason it wasn't
    } catch (err) {
      if (err?.digest?.startsWith?.('NEXT_REDIRECT')) throw err;
      setNote('That picture could not be read.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <input name="manual" required inputMode="numeric" pattern="[0-9]" placeholder={`Score (0–${max})`} aria-label={`${name} score out of ${max}`} />
      <label className="small muted">📷 The picture {name} saves (needed as proof)
        <input name="picture" type="file" accept="image/*" required />
      </label>
      <button className="btn primary small" disabled={busy} aria-busy={busy}>Post score</button>
      {note && <small className="muted" role="status">{note}</small>}
    </form>
  );
}
