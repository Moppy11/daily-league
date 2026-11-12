'use client';
import { useState } from 'react';

// Shares a link to a page on this site: the phone's share sheet where there is one, otherwise the clipboard.
export default function CopyLink({ path, label = 'Share invite link', title = 'Join my league', className = 'btn' }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = window.location.origin + path;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? 'Copied ✓' : label}
    </button>
  );
}
