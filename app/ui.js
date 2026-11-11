// Small shared server components.
export function Flash({ sp }) {
  if (sp?.err) return <p className="flash err" role="alert">{sp.err}</p>;
  if (sp?.msg) return <p className="flash ok" role="status">{sp.msg}</p>;
  return null;
}

export function Medal({ pos }) {
  return <span className="pos">{pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}</span>;
}
