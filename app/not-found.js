import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="card narrow center-text">
      <h1>Page not found</h1>
      <p className="muted">That page doesn&apos;t exist, or it has moved.</p>
      <p><Link className="btn primary" href="/">Back to today</Link></p>
    </section>
  );
}
