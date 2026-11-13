'use client';
import { useActionState } from 'react';
import { createRecoveryCode } from '../actions';

export default function RecoveryCode({ hasCode }) {
  const [state, action, pending] = useActionState(createRecoveryCode, null);
  return (
    <form action={action} className="stack">
      {state?.code ? (
        <>
          <p>Your recovery code. <b>Save it somewhere safe now</b>; it won&apos;t be shown again.</p>
          <p className="code" aria-live="polite">{state.code}</p>
        </>
      ) : (
        <p className="muted">
          {hasCode ? 'You have a recovery code. Making a new one replaces it.' : 'You don\'t have a recovery code yet.'}
        </p>
      )}
      <button className="btn" disabled={pending}>{hasCode || state?.code ? 'Make a new code' : 'Create recovery code'}</button>
    </form>
  );
}
