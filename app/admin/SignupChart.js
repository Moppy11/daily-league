'use client';
import { useState } from 'react';

// Sign-ups per day as bars, with a tooltip on hover or tap. One series, so no legend: the heading names it.
export default function SignupChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 180, top = 12, bottom = 24, left = 28, right = 8;
  const max = Math.max(1, ...days.map((d) => d.n));
  const step = (W - left - right) / days.length;
  const barW = Math.max(2, step - 2); // 2px gap between bars
  const y = (n) => top + (H - top - bottom) * (1 - n / max);
  const base = H - bottom;
  const label = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const h = hover !== null ? days[hover] : null;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sign-ups per day, last ${days.length} days, most in a day ${max}`} onMouseLeave={() => setHover(null)}>
        {[0, max].map((v) => (
          <g key={v}>
            <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className="grid" />
            <text x={left - 6} y={y(v) + 4} textAnchor="end" className="axis">{v}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = left + i * step + 1, hgt = base - y(d.n);
          return (
            <g key={d.date}>
              {d.n > 0 && (
                // Rounded 4px at the data end, square at the baseline.
                <path className={'bar' + (hover === i ? ' on' : '')}
                  d={`M${x},${base} V${base - hgt + Math.min(4, hgt)} q0,-${Math.min(4, hgt)} ${Math.min(4, barW / 2)},-${Math.min(4, hgt)} H${x + barW - Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, hgt)} V${base} Z`} />
              )}
              {/* Hit area: the whole column, so thin or empty days are easy to hover. */}
              <rect x={left + i * step} y={top} width={step} height={base - top} fill="transparent"
                onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
        <text x={left} y={H - 6} className="axis">{label(days[0].date)}</text>
        <text x={W - right} y={H - 6} textAnchor="end" className="axis">{label(days[days.length - 1].date)}</text>
      </svg>
      <p className="chart-tip" aria-live="polite">
        {h ? <><b>{h.n}</b> sign-up{h.n === 1 ? '' : 's'} on {label(h.date)}</> : <span className="muted">Hover or tap a day</span>}
      </p>
    </div>
  );
}
