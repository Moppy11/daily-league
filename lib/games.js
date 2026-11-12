// Game catalogue and share-text parsers.
// Every game reduces a day's result to one number. `higherBetter` says which way is good.
import { daysBetween, addDays, isDate } from './dates.js';

// Games that print a date instead of a puzzle number: the date becomes the number,
// so the same "is this today's puzzle" and "already used" checks apply.
const DATE_EPOCH = { date: '2020-01-01', no: 0 };
const dateNo = (iso) => daysBetween(DATE_EPOCH.date, iso);

const num = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);
const chars = (s) => Array.from(s.replace(/[️\s]/g, ''));

function guessGame({ id, name, url, emoji, re, max = 6, epoch }) {
  return {
    id, name, url, emoji, epoch, type: 'guesses', max, higherBetter: false,
    hint: `Paste the share text, e.g. "${name} #123 4/${max}"`,
    parse(t) {
      const m = t.match(re);
      if (!m) return null;
      const fail = /x/i.test(m[2]);
      return { puzzleNo: num(m[1]), score: fail ? max + 1 : Number(m[2]) };
    },
  };
}

function timeGame({ id, name, url, emoji }) {
  const re = new RegExp(name + '\\s*#\\s*([\\d,]+)[^\\d]*?(\\d+):(\\d{2})', 'i');
  return {
    id, name, url, emoji, type: 'time', higherBetter: false,
    hint: `Paste the share text, e.g. "${name} #123 | 1:23"`,
    parse(t) {
      const m = t.match(re);
      if (!m) return null;
      return { puzzleNo: num(m[1]), score: Number(m[2]) * 60 + Number(m[3]) };
    },
  };
}

export const GAMES = [
  {
    // Daily share text is built by krillion.io as "Krillion #N 🦐 / score / blank / seven tier emoji".
    // Each emoji has a fixed value, so the score must equal the sum of the row.
    id: 'krillion', name: 'Krillion', url: 'https://krillion.io', emoji: '🦐',
    type: 'points', max: 700, higherBetter: true, epoch: { date: '2026-07-16', no: 1 },
    hint: 'Paste your Krillion result, e.g. "Krillion #119 🦐 265 🦑🏮🐟⬛🦑⬛🐟"',
    parse(t) {
      // "Krillion ⟲ #" (archive) and "Krillion ∞ #" (unlimited) are not the daily dive.
      const m = t.match(/^\s*Krillion #(\d{1,5}) 🦐[ \t]*\r?\n[ \t]*(\d{1,3})[ \t]*\r?\n\s*(\S+)/u);
      if (!m) return null;
      const tiers = { '🫧': 10, '🤡': 15, '🐟': 30, '🦑': 60, '🏮': 85, '🌟': 100, '⬛': 0 };
      const row = chars(m[3]);
      if (row.length !== 7 || !row.every((c) => c in tiers)) return null;
      const score = Number(m[2]);
      if (row.reduce((sum, c) => sum + tiers[c], 0) !== score) return null;
      return { puzzleNo: Number(m[1]), score };
    },
  },
  {
    // Share text built by dailyholes.com: round number, course · score to par (strokes),
    // nine squares in rows of three, then a "beat my score" link carrying the score and date.
    id: 'dailyholes', name: 'Daily Holes', url: 'https://dailyholes.com', emoji: '⛳',
    type: 'par', higherBetter: false, epoch: { date: '2026-11-12', no: 316 },
    hint: 'Paste your Daily Holes scorecard',
    parse(t) {
      // "Daily Holes — practice round" has no round number and doesn't count.
      const m = t.match(/^\s*Daily Holes — Round #(\d{1,6})[^\n]*\r?\n[^\n]*· (E|[+-]\d{1,2}) \((\d{1,3})\)[ \t]*\r?\n/u);
      if (!m) return null;
      const score = m[2] === 'E' ? 0 : Number(m[2]);
      const strokes = Number(m[3]);
      const par = strokes - score;
      if (par < 27 || par > 45) return null; // nine holes of par 3 to 5
      // One square per hole: 🟦 two or more under, 🟩 one under, ⬜ par, 🟨 one over, 🟧 two over, 🟥 three or more over.
      const value = { '🟩': -1, '⬜': 0, '🟨': 1, '🟧': 2 };
      const holes = chars(t).filter((c) => c in value || c === '🟦' || c === '🟥');
      if (holes.length !== 9) return null;
      const fixed = holes.reduce((sum, c) => sum + (value[c] ?? 0), 0);
      const blue = holes.filter((c) => c === '🟦').length, red = holes.filter((c) => c === '🟥').length;
      const low = fixed - 4 * blue + 3 * red, high = fixed - 2 * blue + (red ? 12 * red : 0);
      if (score < low || score > high) return null;
      const puzzleNo = Number(m[1]);
      // The link repeats the score and the date; if it's there, it has to agree.
      const beat = t.match(/[?&]beat=(-?\d+)/), day = t.match(/[?&]d=(\d{4}-\d{2}-\d{2})/);
      if (beat && Number(beat[1]) !== score) return null;
      if (day && day[1] !== puzzleDate(this, puzzleNo)) return null;
      return { puzzleNo, score };
    },
  },
  {
    // Share text built by fermi.gg: three numbered rounds showing how many times off each guess was,
    // a rule, then the score, which is the geometric mean of the rounds (each capped at 1,000×).
    id: 'fermi', name: 'Fermi', url: 'https://fermi.gg', emoji: '🧪',
    type: 'factor', higherBetter: false, epoch: { date: '2026-11-12', no: 109 },
    hint: 'Paste your Fermi result',
    parse(t) {
      const head = t.match(/^\s*Fermi · No\. (\d{1,6})[ \t]*\r?\n/u);
      const total = t.match(/^[ \t]*([\d,.]+)× score\b/mu);
      if (!head || !total) return null;
      const rounds = [...t.matchAll(/^[ \t]*(\d{2}) (?:[↑↓=] )?(?:([\d,.]+)×|(—))[ \t]*$/gmu)];
      if (rounds.length !== 3 || rounds.some((r, i) => Number(r[1]) !== i + 1)) return null;
      const off = rounds.map((r) => (r[3] ? 1000 : Math.min(1000, Math.max(1, Number(r[2].replace(/,/g, ''))))));
      const score = Number(total[1].replace(/,/g, ''));
      if (off.some(Number.isNaN) || !(score >= 1 && score <= 1000)) return null;
      const mean = 10 ** (off.reduce((sum, x) => sum + Math.log10(x), 0) / off.length);
      if (Math.abs(mean - score) / mean > 0.02) return null; // allows for the rounding in the printed numbers
      return { puzzleNo: Number(head[1]), score };
    },
  },
  {
    id: 'noillirk', name: 'Noillirk', url: 'https://playdaily.org/noillirk', emoji: '🎈',
    type: 'count', unit: 'm', higherBetter: true, epoch: { date: '2026-11-12', no: 47 },
    hint: 'Paste your Noillirk result, e.g. "Noillirk 🎈 The Daily Climb · No. 47 · 3,163m"',
    parse(t) {
      const m = t.match(/^\s*Noillirk\s*(?:🎈\s*)?The Daily Climb\s*·\s*No\.\s*(\d{1,9})\s*·\s*(\d{1,3}(?:,\d{3})+|\d+)\s*m\s*$/imu);
      if (!m) return null;
      const score = num(m[2]);
      // The daily climb is seven prompts, one coloured square each.
      const tiers = new Set(['⬛', '⬜', '🟦', '🟩', '🟧', '🟥', '🟨']);
      const squares = chars(t).filter((c) => tiers.has(c));
      if (squares.length !== 7) return null;
      return score <= 1e7 ? { puzzleNo: Number(m[1]), score } : null;
    },
  },
  {
    id: 'size-it-up', name: 'Size It Up', url: 'https://magnitudle.com/size-it-up', emoji: '📏',
    type: 'points', max: 500, higherBetter: true, epoch: DATE_EPOCH,
    hint: 'Paste your Magnitudle — Size It Up result, including the Score: 305/500 line.',
    parse(t) {
      const m = t.match(/^\s*Magnitudle[ \t]+[—–-][ \t]+Size It Up[ \t]*\r?\n[ \t]*(\d{4}-\d{2}-\d{2})[ \t]*\r?\n\s*Score:[ \t]*(\d{1,3})[ \t]*\/[ \t]*500[ \t]*$/im);
      if (!m) return null;
      const score = Number(m[2]);
      // Five rounds are listed under the total and must add up to it.
      const rounds = [...t.matchAll(/^[ \t]*\S{5}[ \t]+(\d{1,3})[ \t]*$/gmu)].map((r) => Number(r[1]));
      if (rounds.length !== 5 || rounds.reduce((a, b) => a + b, 0) !== score) return null;
      return score <= 500 && isDate(m[1]) ? { puzzleNo: dateNo(m[1]), score } : null;
    },
  },
  {
    id: 'wordle', name: 'Wordle', url: 'https://www.nytimes.com/games/wordle', emoji: '🟩',
    type: 'guesses', max: 6, higherBetter: false, epoch: { date: '2021-06-19', no: 0 },
    hint: 'Paste the full share text, including the coloured squares',
    parse(t) {
      const m = t.match(/Wordle\s+([\d,.]+)\s+([1-6X])\/6/i);
      if (!m) return null;
      const fail = /x/i.test(m[2]);
      const score = fail ? 7 : Number(m[2]);
      // The grid has one row per guess, and only a solved game ends on an all-correct row.
      const cells = new Set(['⬛', '⬜', '🟨', '🟩', '🟦', '🟧']);
      const rows = t.split(/\r?\n/).map(chars).filter((r) => r.length === 5 && r.every((c) => cells.has(c)));
      const solved = (r) => r.every((c) => c === '🟩') || r.every((c) => c === '🟧');
      if (rows.length !== (fail ? 6 : score)) return null;
      if (rows.slice(0, -1).some(solved) || solved(rows[rows.length - 1]) === fail) return null;
      return { puzzleNo: num(m[1]), score };
    },
  },
  {
    id: 'connections', name: 'Connections', url: 'https://www.nytimes.com/games/connections', emoji: '🟪',
    type: 'count', unit: 'mistakes', max: 4, higherBetter: false, epoch: { date: '2023-06-12', no: 1 },
    hint: 'Paste the share text (Connections, Puzzle #…, coloured rows)',
    parse(t) {
      if (!/connections/i.test(t)) return null;
      const p = t.match(/Puzzle\s*#\s*([\d,]+)/i);
      const colours = new Set(['🟨', '🟩', '🟦', '🟪']);
      const rows = t.split(/\r?\n/).map(chars).filter((r) => r.length === 4 && r.every((c) => colours.has(c)));
      if (!p || rows.length === 0 || rows.length > 8) return null;
      const mistakes = rows.filter((r) => new Set(r).size > 1).length;
      return { puzzleNo: num(p[1]), score: Math.min(mistakes, 4) };
    },
  },
  {
    id: 'strands', name: 'Strands', url: 'https://www.nytimes.com/games/strands', emoji: '🔵',
    type: 'count', unit: 'hints', higherBetter: false, epoch: { date: '2024-03-04', no: 1 },
    hint: 'Paste the share text (Strands #…, coloured dots)',
    parse(t) {
      const p = t.match(/Strands\s*#\s*([\d,]+)/i);
      if (!p || !/[🔵🟡]/u.test(t)) return null;
      return { puzzleNo: num(p[1]), score: chars(t).filter((c) => c === '💡').length };
    },
  },
  {
    id: 'mini', name: 'NYT Mini', url: 'https://www.nytimes.com/crosswords/game/mini', emoji: '✏️',
    type: 'time', higherBetter: false, epoch: DATE_EPOCH,
    hint: 'Paste the share text, e.g. "I solved the Mini Crossword in 0:45"',
    parse(t) {
      if (!/mini/i.test(t)) return null;
      const m = t.match(/\bin\s+(\d+):(\d{2})/i);
      if (!m) return null;
      const d = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
      const iso = d ? `${d[3]}-${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')}` : null;
      return { puzzleNo: iso && isDate(iso) ? dateNo(iso) : null, score: Number(m[1]) * 60 + Number(m[2]) };
    },
  },
  guessGame({
    id: 'worldle', name: 'Worldle', url: 'https://worldle.teuteuf.fr', emoji: '🌍',
    re: /Worldle\s*#\s*([\d,]+)[^\n]*?([1-6X])\/6/i,
  }),
  {
    id: 'framed', name: 'Framed', url: 'https://framed.wtf', emoji: '🎥',
    type: 'guesses', max: 6, higherBetter: false,
    hint: 'Paste the share text (Framed #… and the coloured squares)',
    parse(t) {
      const p = t.match(/Framed\s*#\s*([\d,]+)/i);
      if (!p) return null;
      const sq = chars(t).filter((c) => c === '🟥' || c === '🟩');
      if (sq.length === 0) return null;
      const hit = sq.indexOf('🟩');
      return { puzzleNo: num(p[1]), score: hit === -1 ? 7 : hit + 1 };
    },
  },
  {
    id: 'timeguessr', name: 'TimeGuessr', url: 'https://timeguessr.com', emoji: '🕰️',
    type: 'points', max: 50000, higherBetter: true,
    hint: 'Paste the share text, e.g. "TimeGuessr #123 42,000/50,000"',
    parse(t) {
      const m = t.match(/TimeGuessr\s*#\s*([\d,]+)\s+([\d,]+)\s*\/\s*50,?000/i);
      if (!m) return null;
      const score = num(m[2]);
      return score <= 50000 ? { puzzleNo: num(m[1]), score } : null;
    },
  },
  guessGame({
    id: 'costcodle', name: 'Costcodle', url: 'https://costcodle.com', emoji: '🛒',
    re: /Costcodle\s*#?\s*([\d,]+)\s+([1-6X])\/6/i,
  }),
  guessGame({
    id: 'bandle', name: 'Bandle', url: 'https://bandle.app', emoji: '🎸',
    re: /Bandle\s*#\s*([\d,]+)\s+([1-6X])\/6/i,
  }),
  {
    id: 'contexto', name: 'Contexto', url: 'https://contexto.me', emoji: '🧠',
    type: 'count', unit: 'guesses', higherBetter: false,
    hint: 'Paste the share text, e.g. "I played contexto.me #123 and got it in 45 guesses"',
    parse(t) {
      const m = t.match(/contexto[^#]*#\s*(\d+)[\s\S]*?(\d+)\s+guess/i);
      return m ? { puzzleNo: Number(m[1]), score: Number(m[2]) } : null;
    },
  },
  guessGame({
    id: 'nerdle', name: 'Nerdle', url: 'https://nerdlegame.com', emoji: '🧮',
    re: /nerdle(?:game)?\s+([\d,]+)\s+([1-6X])\/6/i,
  }),
  guessGame({
    id: 'flagle', name: 'Flagle', url: 'https://www.flagle.io', emoji: '🏁',
    re: /Flagle\s*#\s*([\d,]+)[^\n]*?([1-6X])\/6/i,
  }),
  {
    id: 'quordle', name: 'Quordle', url: 'https://www.merriam-webster.com/games/quordle', emoji: '🔠',
    type: 'count', unit: 'total', higherBetter: false,
    hint: 'Paste the share text (Daily Quordle … and the four number squares)',
    parse(t) {
      const p = t.match(/Daily Quordle\s+([\d,]+)/i);
      if (!p) return null;
      // Four words: the number of guesses each took, or 🟥 for a miss (counted as 10).
      const marks = [...t.matchAll(/([1-9])\uFE0F?\u20E3|🟥/gu)].slice(0, 4);
      if (marks.length !== 4) return null;
      return { puzzleNo: num(p[1]), score: marks.reduce((a, m) => a + (m[1] ? Number(m[1]) : 10), 0) };
    },
  },
  {
    id: 'globle', name: 'Globle', url: 'https://globle-game.com', emoji: '🌐',
    type: 'count', unit: 'guesses', higherBetter: false,
    hint: 'Paste the share text (ends with the squares and "= 5")',
    parse(t) {
      if (!/🌎[^\n]*🌍/u.test(t)) return null;
      const m = t.match(/=\s*(\d{1,3})\s*$/m);
      return m ? { puzzleNo: null, score: Number(m[1]) } : null;
    },
  },
  {
    id: 'travle', name: 'Travle', url: 'https://travle.earth', emoji: '🧭',
    type: 'count', unit: 'extra', higherBetter: false,
    hint: 'Paste the share text, e.g. "#travle #700 +2"',
    parse(t) {
      const m = t.match(/#travle\s+#(\d+)\s+(?:\+(\d{1,2})|\(\d+ away\))/i);
      if (!m) return null;
      return { puzzleNo: Number(m[1]), score: m[2] === undefined ? 20 : Number(m[2]) }; // not finished counts as 20
    },
  },
  {
    id: 'guessthegame', name: 'GuessThe.Game', url: 'https://guessthe.game', emoji: '🎮',
    type: 'guesses', max: 6, higherBetter: false,
    hint: 'Paste the share text (#GuessTheGame #… and the coloured squares)',
    parse(t) {
      const p = t.match(/#?GuessTheGame\s*#\s*([\d,]+)/i);
      if (!p) return null;
      const sq = chars(t).filter((c) => c === '🟥' || c === '🟨' || c === '🟩');
      if (sq.length === 0) return null;
      const hit = sq.indexOf('🟩');
      return { puzzleNo: num(p[1]), score: hit === -1 ? 7 : hit + 1 };
    },
  },
  timeGame({ id: 'queens', name: 'Queens', url: 'https://www.linkedin.com/games/queens', emoji: '👑' }),
  timeGame({ id: 'tango', name: 'Tango', url: 'https://www.linkedin.com/games/tango', emoji: '🌗' }),
  timeGame({ id: 'zip', name: 'Zip', url: 'https://www.linkedin.com/games/zip', emoji: '🧵' }),
];

const BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g]));

export const builtin = (id) => BY_ID[id] ?? null;
export const isCustomId = (id) => /^c\d+$/.test(id);

export function customToGame(row) {
  return {
    id: 'c' + row.id, name: row.name, url: row.url, emoji: '🎲', type: 'custom',
    unit: row.unit, higherBetter: row.higher_better, custom: true, createdBy: row.created_by,
  };
}

export function formatScore(game, score) {
  if (score === null || score === undefined) return '–';
  const n = Math.round(score * 100) / 100;
  switch (game.type) {
    case 'factor': return `${n.toLocaleString('en-GB')}×`;
    case 'par': return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`;
    case 'guesses': return score > game.max ? `X/${game.max}` : `${n}/${game.max}`;
    case 'time': {
      const s = Math.round(score);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    case 'points': return game.max ? `${n.toLocaleString('en-GB')}/${game.max.toLocaleString('en-GB')}` : `${n}`;
    default: return `${n.toLocaleString('en-GB')} ${game.unit ?? ''}`.trim();
  }
}

// Averages lose the "/6" suffix so 3.42 doesn't read as a real result.
export function formatAvg(game, avg) {
  if (avg === null || avg === undefined) return '–';
  if (game.type === 'time') return formatScore(game, avg);
  if (game.type === 'par') return formatScore(game, Number(avg.toFixed(1)));
  if (game.type === 'factor') return formatScore(game, Number(avg.toFixed(avg < 10 ? 2 : 1)));
  const places = Math.abs(avg) >= 100 ? 0 : Math.abs(avg) >= 10 ? 1 : 2;
  return Number(avg.toFixed(places)).toLocaleString('en-GB');
}

// Manual entry: "4", "X", "1:23" depending on the game. Returns a number or null.
export function parseManual(game, input) {
  const s = String(input ?? '').trim().replace(/×$/, '');
  if (!s) return null;
  if (game.type === 'guesses' && /^x$/i.test(s)) return game.max + 1;
  if (game.type === 'par') return /^e$/i.test(s) ? 0 : /^[+-]?\d{1,2}$/.test(s) ? Number(s) : null;
  let v;
  const t = s.match(/^(\d+):(\d{2})$/);
  if (t) v = Number(t[1]) * 60 + Number(t[2]);
  else if (/^\d+(\.\d+)?$/.test(s.replace(/,/g, ''))) v = Number(s.replace(/,/g, ''));
  else return null;
  if (game.type === 'guesses' && (v < 1 || v > game.max || !Number.isInteger(v))) return null;
  if (game.max && game.type !== 'guesses' && v > game.max) return null;
  if (v < 0 || v > 1e7) return null;
  return v;
}

// The date a numbered puzzle belongs to, where that is known.
export function puzzleDate(game, puzzleNo) {
  if (!game.epoch || puzzleNo === null || puzzleNo === undefined) return null;
  return addDays(game.epoch.date, puzzleNo - game.epoch.no);
}

// The puzzle number this game should have on a given date, where that is known.
export function expectedPuzzle(game, date) {
  if (!game.epoch) return null;
  return game.epoch.no + daysBetween(game.epoch.date, date);
}
