'use client';

export default function Error({ reset }) {
  return (
    <section className="card narrow center-text">
      <h1>Something went wrong</h1>
      <p className="muted">Nothing was lost. Try again in a moment.</p>
      <p><button className="btn primary" onClick={() => reset()}>Try again</button></p>
    </section>
  );
}
