'use client';
import { useState } from 'react';

export default function CopyLink({ path }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = window.location.origin + path;
    try {
      if (navigator.share) await navigator.share({ title: 'Join my league', url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  return (
    <button type="button" className="btn" onClick={copy}>
      {copied ? 'Copied ✓' : 'Share invite link'}
    </button>
  );
}
