'use client';
import { useRef, useState } from 'react';

const norm = (s) => s.replace(/\s+/g, ' ').trim();

// A result box that notices when a pasted result has been changed before posting.
// It can't stop a determined cheat, but an edited result is marked as unverified for the league to see.
export default function PasteBox({ name = 'text', rows = 2, placeholder, label, required = false, defaultValue = '' }) {
  const [value, setValue] = useState(defaultValue);
  const [snap, setSnap] = useState(defaultValue || null); // the text exactly as pasted
  const [mixed, setMixed] = useState(false); // pasted into text that was already there
  const ref = useRef(null);

  function onPaste() {
    const el = ref.current;
    const full = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    if (el.value.trim() && !full) setMixed(true);
  }
  function onChange(e) {
    const v = e.target.value;
    const kind = e.nativeEvent?.inputType ?? '';
    // Some phone keyboards paste from their clipboard bar as if typing, so a big jump in one go counts as a paste.
    const bigJump = v.length - value.length >= 15;
    if (kind === 'insertFromPaste' || kind === 'insertFromDrop' || bigJump) setSnap(v);
    if (!v.trim()) { setSnap(null); setMixed(false); }
    setValue(v);
  }

  const edited = value.trim() !== '' && (mixed || snap === null || norm(value) !== norm(snap));
  return (
    <>
      <textarea ref={ref} name={name} rows={rows} placeholder={placeholder} aria-label={label} required={required}
        value={value} onChange={onChange} onPaste={onPaste} spellCheck={false} autoCorrect="off" autoCapitalize="off" />
      <input type="hidden" name="edited" value={edited ? '1' : '0'} />
      {edited && (
        <small className="edit-warn" role="status">
          ✍️ This doesn&apos;t match what was pasted, so it will be marked as edited for your league. Paste the result again, unchanged, to post it as verified.
        </small>
      )}
    </>
  );
}
