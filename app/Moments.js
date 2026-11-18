'use client';
import { useFormStatus } from 'react-dom';
import { dismissMoment, laughRecord } from './actions';

// One pop-up at a time: personal bests and worsts, and league records broken. A worst-ever record can be laughed at.
export default function Moments({ moments, me }) {
  // The server marks each one seen and sends the list again, so the first one is always the one to show.
  const m = moments[0], i = 0;
  if (!m) return null;
  const tone = m.kind === 'pb' ? 'good' : m.kind === 'pw' ? 'bad' : m.record_kind === 'worst' ? 'bad' : 'good';
  const canLaugh = m.record_kind === 'worst' && m.holder_id !== me;
  return (
    <div className="moment-backdrop" role="dialog" aria-modal="true" aria-label="Daily League moment">
      <div className={'moment card ' + tone}>
        <p className="moment-body">{m.body}</p>
        {m.record_kind === 'worst' && m.laughs > 0 && <p className="muted small">😂 {m.laughs} laugh{m.laughs === 1 ? '' : 's'} so far</p>}
        <div className="row moment-actions">
          {canLaugh && !m.laughed && (
            <form action={laughRecord}>
              <input type="hidden" name="event" value={m.event_id} />
              <input type="hidden" name="moment" value={m.id} />
              <Btn className="btn primary">😂 Laugh</Btn>
            </form>
          )}
          <form action={dismissMoment}>
            <input type="hidden" name="moment" value={m.id} />
            <Btn className="btn">{m.kind === 'pb' ? 'Thanks 😎' : m.kind === 'pw' ? 'Ouch 😭' : 'Nice'}</Btn>
          </form>
        </div>
        {moments.length - i > 1 && <p className="muted small">{moments.length - i - 1} more</p>}
      </div>
    </div>
  );
}

function Btn({ className, children }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{children}</button>;
}
