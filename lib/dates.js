export function validTz(tz) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Today's date (YYYY-MM-DD) in the given IANA time zone.
export function todayIn(tz) {
  const zone = tz && validTz(tz) ? tz : 'UTC';
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
}

export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

export function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export function prettyDate(date) {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export function monthLabel(ym) {
  return new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

// Every YYYY-MM from `from` to `to` inclusive, newest first.
export function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out.reverse();
}
