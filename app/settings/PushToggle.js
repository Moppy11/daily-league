'use client';
import { useEffect, useState } from 'react';
import { savePushSub, removePushSub, testPush } from '../actions';

const toKey = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// Turns phone notifications on or off for this device.
export default function PushToggle({ publicKey }) {
  const [state, setState] = useState('checking'); // checking | unsupported | off | on | blocked
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported');
      if (Notification.permission === 'denied') return setState('blocked');
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      setState(reg && (await reg.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  async function enable() {
    setNote('');
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setState(Notification.permission === 'denied' ? 'blocked' : 'off');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
      await savePushSub(sub.toJSON());
      setState('on');
    } catch {
      setNote('Could not turn notifications on for this device.');
    }
  }

  async function disable() {
    setNote('');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) { await removePushSub(sub.endpoint); await sub.unsubscribe(); }
      setState('off');
    } catch {
      setNote('Could not turn notifications off.');
    }
  }

  async function test() {
    const sent = await testPush();
    setNote(sent ? 'Test sent. It should appear in a few seconds.' : 'Nothing was sent. Try turning notifications off and on again.');
  }

  if (state === 'checking') return <p className="muted">Checking this device…</p>;
  if (state === 'unsupported') {
    return <p className="muted">This browser can&apos;t receive notifications. On an iPhone, first add Daily League to your home screen (Share, then Add to Home Screen) and open it from there.</p>;
  }
  if (state === 'blocked') return <p className="muted">Notifications are blocked for this site in your browser settings. Allow them there, then come back.</p>;
  return (
    <div className="stack">
      <p className="muted">{state === 'on' ? 'Notifications are on for this device.' : 'Get scores, reminders, chat and challenges on this device, even when the site is closed.'}</p>
      <div className="row">
        {state === 'on'
          ? <><button className="btn" onClick={test}>Send a test</button><button className="btn" onClick={disable}>Turn off</button></>
          : <button className="btn primary" onClick={enable}>Turn on notifications</button>}
      </div>
      {note && <p className="muted small" role="status">{note}</p>}
    </div>
  );
}
