import test from 'node:test';
import assert from 'node:assert/strict';
import { builtin, formatScore, parseManual, expectedPuzzle, puzzleDate } from '../lib/games.js';
import { rankDay, standings, withPositions } from '../lib/points.js';

const p = (id, t) => builtin(id).parse(t);

test('share text parsers', () => {
  const g = '⬛🟨⬛⬛⬛', win = '🟩🟩🟩🟩🟩';
  assert.deepEqual(p('wordle', `Wordle 1,234 4/6\n\n${g}\n${g}\n${g}\n${win}`), { puzzleNo: 1234, score: 4 });
  assert.deepEqual(p('wordle', `Wordle 1,234 X/6*\n\n${[g, g, g, g, g, g].join('\n')}`), { puzzleNo: 1234, score: 7 });
  // Edited pastes: score changed without the grid, missing grid, grid that never solves.
  assert.equal(p('wordle', `Wordle 1,234 2/6\n\n${g}\n${g}\n${g}\n${win}`), null);
  assert.equal(p('wordle', 'Wordle 1,234 2/6'), null);
  assert.equal(p('wordle', `Wordle 1,234 2/6\n\n${g}\n${g}`), null);
  assert.equal(p('wordle', `Wordle 1,234 3/6\n\n${win}\n${g}\n${win}`), null);
  assert.equal(p('wordle', 'I got it in 2'), null);
  assert.deepEqual(p('connections', 'Connections\nPuzzle #500\n🟨🟨🟨🟨\n🟩🟪🟩🟩\n🟩🟩🟩🟩\n🟦🟦🟦🟦\n🟪🟪🟪🟪'), { puzzleNo: 500, score: 1 });
  assert.deepEqual(p('strands', 'Strands #200\n“Theme”\n💡🔵🔵🟡🔵💡🔵'), { puzzleNo: 200, score: 2 });
  assert.deepEqual(p('mini', 'I solved the 11/11/2026 New York Times Mini Crossword in 1:05!'), { puzzleNo: 2506, score: 65 });
  assert.equal(puzzleDate(builtin('mini'), 2506), '2026-11-11');
  assert.deepEqual(p('nerdle', 'nerdlegame 1034 4/6\n\n⬛🟪'), { puzzleNo: 1034, score: 4 });
  assert.deepEqual(p('quordle', 'Daily Quordle 1023\n4️⃣5️⃣\n🟥7️⃣\nm-w.com/games/quordle/'), { puzzleNo: 1023, score: 26 });
  assert.deepEqual(p('globle', '🌎 Nov 12, 2026 🌍\n🔥 3 | Avg. Guesses: 6\n🟨🟧🟥🟩 = 4\n\nhttps://globle-game.com'), { puzzleNo: null, score: 4 });
  assert.deepEqual(p('travle', '#travle #700 +2\n✅🟧✅'), { puzzleNo: 700, score: 2 });
  assert.deepEqual(p('travle', '#travle #700 +0 (Perfect)'), { puzzleNo: 700, score: 0 });
  assert.deepEqual(p('guessthegame', '#GuessTheGame #900\n\n🎮 🟥 🟨 🟩 ⬜ ⬜ ⬜'), { puzzleNo: 900, score: 3 });
  assert.deepEqual(p('framed', 'Framed #900\n🎥 🟥 🟥 🟩 ⬛ ⬛ ⬛'), { puzzleNo: 900, score: 3 });
  assert.deepEqual(p('framed', 'Framed #900\n🎥 🟥 🟥 🟥 🟥 🟥 🟥'), { puzzleNo: 900, score: 7 });
  assert.deepEqual(p('timeguessr', 'TimeGuessr #800 42,105/50,000\n🌎🟩🟩🟩'), { puzzleNo: 800, score: 42105 });
  assert.deepEqual(p('queens', 'Queens #300 | 1:23\nFirst 👑s: 🟪'), { puzzleNo: 300, score: 83 });
  assert.deepEqual(p('contexto', 'I played contexto.me #700 and got it in 45 guesses.'), { puzzleNo: 700, score: 45 });
  assert.deepEqual(p('worldle', '#Worldle #1500 (11.11.2026) 3/6 (100%)'), { puzzleNo: 1500, score: 3 });
});

test('krillion: exact daily format, emoji must add up to the score', () => {
  const real = 'Krillion #119 🦐\n265\n\n🦑🏮🐟⬛🦑⬛🐟';
  assert.deepEqual(p('krillion', real), { puzzleNo: 119, score: 265 });
  assert.deepEqual(p('krillion', real.replaceAll('\n', '\r\n') + '\r\n\r\nhttps://krillion.io'), { puzzleNo: 119, score: 265 });
  assert.deepEqual(p('krillion', 'Krillion #120 🦐\n700\n\n🌟🌟🌟🌟🌟🌟🌟'), { puzzleNo: 120, score: 700 });
  assert.equal(p('krillion', real.replace('265', '565')), null);            // score edited
  assert.equal(p('krillion', real.replace('⬛🐟', '🐟')), null);              // a round removed
  assert.equal(p('krillion', real.replace('Krillion #', 'Krillion ⟲ #')), null); // archive dive
  assert.equal(p('krillion', real.replace('Krillion #', 'Krillion ∞ #')), null); // unlimited mode
  assert.equal(p('krillion', 'Krillion #119 🦐\n265'), null);
  assert.equal(p('krillion', 'Wordle 1,234 4/6'), null);
  assert.equal(puzzleDate(builtin('krillion'), 119), '2026-11-11');
  assert.equal(expectedPuzzle(builtin('krillion'), '2026-11-12'), 120);
});

test('formatting, manual entry, puzzle dates', () => {
  assert.equal(formatScore(builtin('wordle'), 7), 'X/6');
  assert.equal(formatScore(builtin('queens'), 83), '1:23');
  assert.equal(formatScore(builtin('krillion'), 540), '540/700');
  assert.equal(parseManual(builtin('wordle'), 'x'), 7);
  assert.equal(parseManual(builtin('wordle'), '9'), null);
  assert.equal(parseManual(builtin('queens'), '1:23'), 83);
  assert.equal(parseManual(builtin('krillion'), '701'), null);
  assert.equal(expectedPuzzle(builtin('noillirk'), '2026-11-13'), 48);
  assert.equal(expectedPuzzle(builtin('wordle'), '2024-03-15'), 1000);
  assert.equal(expectedPuzzle(builtin('connections'), '2023-06-12'), 1);
});

test('Noillirk share text, display and higher-is-better ranking', () => {
  const share = 'Noillirk 🎈 The Daily Climb · No. 47 · 3,163m\n\n🟩🟥🟧🟩🟨🟦🟨\n\nClimb today\'s prompts: https://playdaily.org/noillirk.';
  const game = builtin('noillirk');
  assert.deepEqual(game.parse(share), { puzzleNo: 47, score: 3163 });
  assert.deepEqual(game.parse('Noillirk The Daily Climb · No. 48 · 0m\n\n⬛⬛⬛⬛⬛⬛⬛'), { puzzleNo: 48, score: 0 });
  assert.equal(game.parse('Noillirk The Daily Climb · No. 48 · 9,999m'), null);
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
  assert.deepEqual(game.parse(share), { puzzleNo: 2507, score: 305 });
  assert.equal(puzzleDate(game, 2507), '2026-11-12');
  assert.equal(game.parse(share.replace('305/500', '405/500')), null); // total edited, rounds no longer add up
  assert.deepEqual(game.parse(share.replaceAll('\n', '\r\n')), { puzzleNo: 2507, score: 305 });
  assert.equal(game.parse(share.replace('305/500', '501/500')), null);
  assert.equal(game.parse(share.replace('305/500', '305/600')), null);
  assert.equal(formatScore(game, 305), '305/500');
  const ranking = rankDay([{ user_id: 1, score: 305 }, { user_id: 2, score: 400 }], game.higherBetter);
  assert.equal(ranking.get(2).points, 10);
});

test('Daily Holes: score to par, squares and link must agree', () => {
  const share = 'Daily Holes — Round #316 · SNIPER\nCragcross Head · -8 (29)\n🟦🟦⬜\n🟦⬜⬜\n🟩⬜🟩\nLongest 289 yds · 9/15 pured\nhttps://dailyholes.com/?beat=-8&d=2026-11-12&by=Moppy';
  const game = builtin('dailyholes');
  assert.deepEqual(game.parse(share), { puzzleNo: 316, score: -8 });
  assert.deepEqual(game.parse(share.replaceAll('\n', '\r\n')), { puzzleNo: 316, score: -8 });
  assert.equal(puzzleDate(game, 316), '2026-11-12');
  assert.deepEqual(game.parse('Daily Holes — Round #317\nFernmoor Links · E (37)\n⬜⬜⬜\n🟩🟨⬜\n⬜⬜⬜\nLongest 250 yds · 3/20 pured'), { puzzleNo: 317, score: 0 });
  assert.deepEqual(game.parse('Daily Holes — Round #317\nFernmoor Links · +5 (42)\n⬜🟨⬜\n🟧🟨⬜\n⬜🟨⬜\nLongest 250 yds · 3/20 pured'), { puzzleNo: 317, score: 5 });
  assert.equal(game.parse(share.replace('-8 (29)', '-15 (22)').replace('beat=-8', 'beat=-15')), null); // squares can't give that
  assert.equal(game.parse(share.replace('-8 (29)', '-3 (34)')), null);          // score edited, squares and link disagree
  assert.equal(game.parse(share.replace('-8 (29)', '-9 (28)')), null);          // link disagrees
  assert.equal(game.parse(share.replace('d=2026-11-12', 'd=2026-11-01')), null); // date disagrees with round
  assert.equal(game.parse(share.replace('🟩⬜🟩', '🟩⬜')), null);               // a hole missing
  assert.equal(game.parse(share.replace('Round #316 · SNIPER', 'practice round')), null);
  assert.equal(formatScore(game, -8), '-8');
  assert.equal(formatScore(game, 0), 'E');
  assert.equal(formatScore(game, 3), '+3');
  assert.equal(parseManual(game, '-4'), -4);
  assert.equal(parseManual(game, 'E'), 0);
  const ranking = rankDay([{ user_id: 1, score: -8 }, { user_id: 2, score: 2 }], game.higherBetter);
  assert.equal(ranking.get(1).points, 10);
});

test('Fermi: score must be the geometric mean of the three rounds', () => {
  const share = 'Fermi · No. 109\n01 ↓ 60.4×\n02 ↑ 13.1×\n03 ↑ 3.57×\n─────────\n14.1× score · top 60%\n<https://fermi.gg/s/daily>';
  const game = builtin('fermi');
  assert.deepEqual(game.parse(share), { puzzleNo: 109, score: 14.1 });
  assert.deepEqual(game.parse(share.replaceAll('\n', '\r\n')), { puzzleNo: 109, score: 14.1 });
  assert.equal(puzzleDate(game, 109), '2026-11-12');
  assert.deepEqual(game.parse('Fermi · No. 110\n01 = 1.00×\n02 ↑ 1,500×\n03 —\n─────────\n100× score\nfermi.gg'), { puzzleNo: 110, score: 100 });
  assert.equal(game.parse(share.replace('14.1× score', '2.10× score')), null); // score edited
  assert.equal(game.parse(share.replace('01 ↓ 60.4×', '01 ↓ 1.04×')), null);    // a round edited
  assert.equal(game.parse(share.replace('03 ↑ 3.57×\n', '')), null);           // a round removed
  assert.equal(formatScore(game, 14.1), '14.1×');
  assert.equal(parseManual(game, '14.1×'), 14.1);
  const ranking = rankDay([{ user_id: 1, score: 14.1 }, { user_id: 2, score: 2.5 }], game.higherBetter);
  assert.equal(ranking.get(2).points, 10);
});
