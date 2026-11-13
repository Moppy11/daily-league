'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addProof } from './actions';

// Lets a player attach a screenshot to a result they posted. The picture is shrunk in the
// browser first, so uploads are small and quick.
export default function ProofUpload({ scoreId }) {
  const input = useRef(null);
  const router = useRouter();
  const [note, setNote] = useState('');

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNote('Uploading…');
    try {
      const img = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.72));
      const fd = new FormData();
      fd.set('score', String(scoreId));
      fd.set('image', blob, 'proof.jpg');
      const res = await addProof(fd);
      setNote(res?.error ?? '');
      if (!res?.error) router.refresh();
    } catch {
      setNote('That picture could not be read.');
    }
    e.target.value = '';
  }

  return (
    <span className="proof-upload">
      <input ref={input} type="file" accept="image/*" hidden onChange={onPick} />
      <button type="button" className="link" onClick={() => input.current.click()}>📷 Add screenshot proof</button>
      {note && <small className="muted" role="status"> {note}</small>}
    </span>
  );
}
