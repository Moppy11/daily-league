'use client';
import { useFormStatus } from 'react-dom';

// A submit button that disables itself while its form is being sent, so a double tap can't post twice.
export default function Submit({ children, className = 'btn primary', ...props }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending} {...props}>
      {children}
    </button>
  );
}
