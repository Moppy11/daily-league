import test from 'node:test';
import assert from 'node:assert/strict';
import { builtin, formatScore, parseManual, expectedPuzzle } from '../lib/games.js';
import { rankDay, standings, withPositions } from '../lib/points.js';

const p = (id, t) => builtin(id).parse(t);

test('share text parsers', () => {
  assert.deepEqual(p('wordle', 'Wordle 1,234 4/6\n\n⬛🟨⬛⬛⬛\n🟩🟩🟩🟩🟩'), { puzzleNo: 1234, score: 4 });
  assert.deepEqual(p('wordle', 'Wordle 1,234 X/6*'), { puzzleNo: 1234, score: 7 });
  assert.equal(p('wordle', 'I got it in 2'), null);
  assert.deepEqual(p('connections', 'Connections\nPuzzle #500\n🟨🟨🟨🟨\n🟩🟪🟩🟩\n🟩🟩🟩🟩\n🟦🟦🟦🟦\n🟪🟪🟪🟪'), { puzzleNo: 500, score: 1 });
  assert.deepEqual(p('strands', 'Strands #200\n“Theme”\n💡🔵🔵🟡🔵💡🔵'), { puzzleNo: 200, score: 2 });
  assert.deepEqual(p('mini', 'I solved the 11/11/2026 New York Times Mini Crossword in 1:05!'), { puzzleNo: null, score: 65 });
  assert.deepEqual(p('framed', 'Framed #900\n🎥 🟥 🟥 🟩 ⬛ ⬛ ⬛'), { puzzleNo: 900, score: 3 });
  assert.deepEqual(p('framed', 'Framed #900\n🎥 🟥 🟥 🟥 🟥 🟥 🟥'), { puzzleNo: 900, score: 7 });
  assert.deepEqual(p('timeguessr', 'TimeGuessr #800 42,105/50,000\n🌎🟩🟩🟩'), { puzzleNo: 800, score: 42105 });
  assert.deepEqual(p('queens', 'Queens #300 | 1:23\nFirst 👑s: 🟪'), { puzzleNo: 300, score: 83 });
  assert.deepEqual(p('contexto', 'I played contexto.me #700 and got it in 45 guesses.'), { puzzleNo: 700, score: 45 });
  assert.deepEqual(p('worldle', '#Worldle #1500 (11.11.2026) 3/6 (100%)'), { puzzleNo: 1500, score: 3 });
});

test('krillion formats', () => {
  assert.deepEqual(p('krillion', 'Krillion #119 🦐\n265\n\n🦑🏮🐟⬛🦑⬛🐟'), { puzzleNo: 119, score: 265 });
  assert.deepEqual(p('krillion', 'Krillion Dive #42\n540/700 · 5,400m\n🟣🔵🟢🟡🟠🔴🟣'), { puzzleNo: 42, score: 540 });
  assert.deepEqual(p('krillion', 'Krillion #42 — 540 pts'), { puzzleNo: 42, score: 540 });
  assert.deepEqual(p('krillion', 'Krillion daily: depth 5,400m'), { puzzleNo: null, score: 540 });
  assert.equal(p('krillion', 'Krillion 900/700'), null);
  assert.equal(p('krillion', 'Wordle 1,234 4/6'), null);
});

test('formatting, manual entry, puzzle dates', () => {
  assert.equal(formatScore(builtin('wordle'), 7), 'X/6');
  assert.equal(formatScore(builtin('queens'), 83), '1:23');
  assert.equal(formatScore(builtin('krillion'), 540), '540/700');
  assert.equal(parseManual(builtin('wordle'), 'x'), 7);
  assert.equal(parseManual(builtin('wordle'), '9'), null);
  assert.equal(parseManual(builtin('queens'), '1:23'), 83);
  assert.equal(parseManual(builtin('krillion'), '701'), null);
  assert.equal(expectedPuzzle(builtin('wordle'), '2024-03-15'), 1000);
  assert.equal(expectedPuzzle(builtin('connections'), '2023-06-12'), 1);
});

test('Noillirk share text, display and higher-is-better ranking', () => {
  const share = 'Noillirk 🎈 The Daily Climb · No. 47 · 3,163m\n\n🟩🟥🟧🟩🟨🟦🟨\n\nClimb today\'s prompts: https://playdaily.org/noillirk.';
  const game = builtin('noillirk');
  assert.deepEqual(game.parse(share), { puzzleNo: 47, score: 3163 });
  assert.deepEqual(game.parse('Noillirk The Daily Climb · No. 48 · 0m'), { puzzleNo: 48, score: 0 });
  assert.equal(game.parse(share.replace('3,163m', '3,16m')), null);
  assert.equal(p('krillion', share), null);
  assert.equal(formatScore(game, 3163), '3,163 m');
  const ranking = rankDay([{ user_id: 1, score: 3000 }, { user_id: 2, score: 3163 }], game.higherBetter);
  assert.equal(ranking.get(2).points, 10);
});

test('rank points and standings', () => {
  const day = rankDay([{ user_id: 1, score: 3 }, { user_id: 2, score: 3 }, { user_id: 3, score: 5 }], false);
  assert.deepEqual([day.get(1).points, day.get(2).points, day.get(3).points], [10, 10, 5]);
  const games = { wordle: builtin('wordle'), krillion: builtin('krillion') };
  const members = [1, 2, 3].map((id) => ({ id, display_name: 'P' + id }));
  const scores = [
    { user_id: 1, game_id: 'wordle', play_date: '2026-11-10', score: 3 },
    { user_id: 2, game_id: 'wordle', play_date: '2026-11-10', score: 4 },
    { user_id: 1, game_id: 'krillion', play_date: '2026-11-10', score: 300 },
    { user_id: 2, game_id: 'krillion', play_date: '2026-11-10', score: 600 },
    { user_id: 2, game_id: 'krillion', play_date: '2026-11-11', score: 100 },
  ];
  const table = withPositions(standings(scores, games, members));
  assert.deepEqual(table.map((r) => [r.user.id, r.total, r.wins, r.pos]), [[2, 27, 1, 1], [1, 17, 1, 2], [3, 0, 0, 3]]);
});

test('Size It Up reads the shared total and ranks higher scores first', () => {
  const share = 'Magnitudle — Size It Up\n2026-11-12\n\nScore: 305/500\n\n🟥🟥⬜⬜⬜ 39\n🟥🟥🟥🟥⬜ 83\n🟥🟥🟥🟥⬜ 89\n⬜⬜⬜⬜⬜ 8\n🟥🟥🟥🟥⬜ 86\n\nhttps://magnitudle.com/size-it-up';
  const game = builtin('size-it-up');
  assert.deepEqual(game.parse(share), { puzzleNo: null, score: 305 });
  assert.deepEqual(game.parse(share.replaceAll('\n', '\r\n').replace('305/500', '500/500')), { puzzleNo: null, score: 500 });
  assert.equal(game.parse(share.replace('305/500', '501/500')), null);
  assert.equal(game.parse(share.replace('305/500', '305/600')), null);
  assert.equal(formatScore(game, 305), '305/500');
  const ranking = rankDay([{ user_id: 1, score: 305 }, { user_id: 2, score: 400 }], game.higherBetter);
  assert.equal(ranking.get(2).points, 10);
});
