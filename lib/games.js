// Game catalogue and share-text parsers.
// Every game reduces a day's result to one number. `higherBetter` says which way is good.
import { daysBetween } from './dates.js';

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
    id: 'krillion', name: 'Krillion', url: 'https://krillion.io', emoji: '🦐',
    type: 'points', max: 700, higherBetter: true,
    hint: 'Paste your Krillion result, e.g. "Krillion #119 🦐 265 …"',
    parse(t) {
      if (!/krillion/i.test(t)) return null;
      let score = null;
      let m = t.match(/(\d{1,3})\s*\/\s*700/) || t.match(/(\d{1,3})\s*(?:pts|points)\b/i);
      if (m) score = Number(m[1]);
      else if ((m = t.match(/^\s*(\d{1,3})\s*$/m))) score = Number(m[1]); // score alone on its own line
      else if ((m = t.match(/([\d,]{2,6})\s*m\b/))) score = num(m[1]) / 10; // depth: 10 m per point
      if (score === null || !Number.isFinite(score) || score < 0 || score > 700) return null;
      const p = t.match(/(?:dive|day|#)\s*#?\s*(\d{1,5})/i);
      return { puzzleNo: p ? Number(p[1]) : null, score };
    },
  },
  guessGame({
    id: 'wordle', name: 'Wordle', url: 'https://www.nytimes.com/games/wordle', emoji: '🟩',
    re: /Wordle\s+([\d,.]+)\s+([1-6X])\/6/i, epoch: { date: '2021-06-19', no: 0 },
  }),
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
    type: 'time', higherBetter: false,
    hint: 'Paste the share text, e.g. "I solved the Mini Crossword in 0:45"',
    parse(t) {
      if (!/mini/i.test(t)) return null;
      const m = t.match(/\bin\s+(\d+):(\d{2})/i);
      if (!m) return null;
      return { puzzleNo: null, score: Number(m[1]) * 60 + Number(m[2]) };
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
  return (Math.round(avg * 100) / 100).toLocaleString('en-GB');
}

// Manual entry: "4", "X", "1:23" depending on the game. Returns a number or null.
export function parseManual(game, input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (game.type === 'guesses' && /^x$/i.test(s)) return game.max + 1;
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

// The puzzle number this game should have on a given date, where that is known.
export function expectedPuzzle(game, date) {
  if (!game.epoch) return null;
  return game.epoch.no + daysBetween(game.epoch.date, date);
}
