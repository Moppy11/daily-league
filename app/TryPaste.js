'use client';
import { useState } from 'react';
import Link from 'next/link';
import { previewResult } from './actions';

// Lets a visitor paste a result and see it recognised, without an account. Nothing is saved.
export default function TryPaste({ example }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  async function check(value = text) {
    if (!value.trim()) return;
    setBusy(true);
    try { setRes(await previewResult(value)); } catch { setRes({ ok: false }); }
    setBusy(false);
  }

  return (
    <div className="card try">
      <textarea rows={4} value={text} onChange={(e) => { setText(e.target.value); setRes(null); }}
        placeholder="Paste a result from Wordle, Krillion, Connections or another supported game" aria-label="Paste a game result" spellCheck={false} />
      <div className="row">
        <button className="btn primary" onClick={() => check()} disabled={busy || !text.trim()}>Check it</button>
        <button className="btn" onClick={() => { setText(example); check(example); }} disabled={busy}>Use an example</button>
      </div>
      {res && (res.ok ? (
        <div className="try-result" role="status">
          <p className="try-line"><span className="emoji">{res.emoji}</span> <b>{res.name}</b> <span className="try-score">{res.score}</span></p>
          <p className="muted small">
            {res.isToday === true && '✓ Today\'s puzzle. '}
            {res.isToday === false && 'This isn\'t today\'s puzzle, so it couldn\'t be posted today. '}
            {res.higherBetter ? 'Higher is better.' : 'Lower is better.'} In a league this is ranked against your friends&apos; {res.name} results today:
            the best gets 10 points.
          </p>
          <Link className="btn primary small" href="/signup">Start a league with friends →</Link>
        </div>
      ) : (
        <p className="muted small" role="status">That doesn&apos;t match a supported game&apos;s result. Use the game&apos;s Share button and paste everything it copies.</p>
      ))}
    </div>
  );
}
