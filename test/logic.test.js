import test from 'node:test';
import assert from 'node:assert/strict';
import { builtin, formatScore, parseManual, expectedPuzzle, puzzleDate, detectGame } from '../lib/games.js';
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
  assert.equal(formatScore(builtin('pips-easy'), 83), '1:23');
  assert.equal(formatScore(builtin('krillion'), 540), '540/700');
  assert.equal(parseManual(builtin('wordle'), 'x'), 7);
  assert.equal(parseManual(builtin('wordle'), '9'), null);
  assert.equal(parseManual(builtin('pips-easy'), '1:23'), 83);
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
  assert.deepEqual(game.parse(share), { puzzleNo: 95, score: 305 });
  assert.equal(puzzleDate(game, 95), '2026-11-12');
  assert.equal(game.parse(share.replace('305/500', '405/500')), null); // total edited, rounds no longer add up
  assert.deepEqual(game.parse(share.replaceAll('\n', '\r\n')), { puzzleNo: 95, score: 305 });
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

test('weeks run Monday to Sunday; weekly winners and records', async () => {
  const { weekStart, weeksBetween, weekLabel } = await import('../lib/dates.js');
  const { weeklyWinners, weeklyWinCounts, leagueRecords } = await import('../lib/records.js');
  assert.equal(weekStart('2026-11-12'), '2026-11-09'); // Thursday
  assert.equal(weekStart('2026-11-09'), '2026-11-09'); // Monday
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday
  assert.deepEqual(weeksBetween('2026-10-28', '2026-11-12'), ['2026-11-09', '2026-11-02', '2026-10-26']);
  assert.equal(weekLabel('2026-11-09'), '9–15 Nov');
  assert.equal(weekLabel('2026-11-30'), '30 Nov – 6 Dec');

  const games = { krillion: builtin('krillion'), wordle: builtin('wordle') };
  const members = [1, 2, 3].map((id) => ({ id, display_name: 'P' + id }));
  const s = (user_id, game_id, play_date, score) => ({ user_id, game_id, play_date, score });
  const scores = [
    s(1, 'krillion', '2026-10-26', 500), s(2, 'krillion', '2026-10-26', 300),            // week of 26 Oct: P1 wins
    s(1, 'krillion', '2026-11-02', 200), s(2, 'krillion', '2026-11-02', 200),            // week of 2 Nov: tie, shared
    s(2, 'wordle', '2026-11-10', 2), s(1, 'wordle', '2026-11-10', 5), s(2, 'krillion', '2026-11-11', 650), // current week
  ];
  const winners = weeklyWinners(scores, games, members, '2026-11-09');
  assert.deepEqual(winners.map((w) => [w.week, w.winners.map((u) => u.id), w.total]), [['2026-11-02', [1, 2], 10], ['2026-10-26', [1], 10]]);
  assert.deepEqual(weeklyWinCounts(winners), { 1: 2, 2: 1 });

  const rec = leagueRecords(scores, games, members, '2026-11-09');
  assert.deepEqual([rec.league.weeklyWins.value, rec.league.weeklyWins.users.map((u) => u.id)], [2, [1]]);
  assert.deepEqual([rec.league.bestWeek.value, rec.league.bestWeek.users[0].id, rec.league.bestWeek.extra], [20, 2, '2026-11-09']);
  const k = rec.perGame.find((r) => r.game.id === 'krillion'), w = rec.perGame.find((r) => r.game.id === 'wordle');
  assert.deepEqual([k.best.value, k.best.users[0].id, k.best.extra], [650, 2, '2026-11-11']);
  assert.deepEqual([w.best.value, w.best.users[0].id], [2, 2]); // lower is better
  assert.equal(k.average, null); // needs five results
  assert.equal(rec.league.posted.value, 4);
});

test('Perceptle: overall score is the average of the five tests and sets the grade', () => {
  const share = 'Perceptle #118 - C (64)\n🔢 37  🎯 97  📐 100  🥁 3  ✂️ 83\nhttps://perceptle.com';
  const game = builtin('perceptle');
  assert.deepEqual(game.parse(share), { puzzleNo: 118, score: 64 });
  assert.deepEqual(game.parse(share.replaceAll('\n', '\r\n')), { puzzleNo: 118, score: 64 });
  assert.deepEqual(game.parse(share.replace('#118', '#119 🃏')), { puzzleNo: 119, score: 64 }); // Friday edition
  assert.equal(puzzleDate(game, 118), '2026-11-12');
  assert.equal(game.parse(share.replace('C (64)', 'S (96)')), null);   // score edited
  assert.equal(game.parse(share.replace('C (64)', 'A (64)')), null);   // grade edited
  assert.equal(game.parse(share.replace('🥁 3', '🥁 93').replace('C (64)', 'C (64)')), null); // a test edited
  assert.equal(game.parse(share.replace('🥁 3  ', '')), null);         // a test removed
  assert.equal(formatScore(game, 64), '64/100');
  const ranking = rankDay([{ user_id: 1, score: 64 }, { user_id: 2, score: 80 }], game.higherBetter);
  assert.equal(ranking.get(2).points, 10);
});

test('league options: weighting, daily cap, dropped day, weekly recap', async () => {
  const { weeklyRecap } = await import('../lib/records.js');
  const games = { krillion: builtin('krillion'), wordle: builtin('wordle'), fermi: builtin('fermi') };
  const members = [1, 2].map((id) => ({ id, display_name: 'P' + id }));
  const s = (user_id, game_id, play_date, score) => ({ user_id, game_id, play_date, score });
  const day = [s(1, 'krillion', '2026-11-09', 500), s(2, 'krillion', '2026-11-09', 300), s(1, 'wordle', '2026-11-09', 5), s(2, 'wordle', '2026-11-09', 3),
    s(1, 'fermi', '2026-11-09', 9), s(2, 'fermi', '2026-11-09', 2)];
  const total = (opts) => Object.fromEntries(standings(day, games, members, opts).map((r) => [r.user.id, r.total]));
  assert.deepEqual(total({}), { 1: 24, 2: 27 });
  assert.deepEqual(total({ weights: { krillion: 3 } }), { 1: 44, 2: 41 });          // 30+7+7 v 21+10+10
  assert.deepEqual(total({ dailyCap: 1 }), { 1: 10, 2: 10 });                        // best single result each
  assert.deepEqual(total({ dailyCap: 2, weights: { krillion: 2 } }), { 1: 27, 2: 24 }); // 20+7 v 14+10

  // Dropped day: P1 plays all seven days, P2 misses one.
  const week = [];
  for (let d = 9; d <= 15; d++) {
    const date = `2026-11-${String(d).padStart(2, '0')}`;
    week.push(s(1, 'krillion', date, d === 15 ? 100 : 500));
    if (d !== 12) week.push(s(2, 'krillion', date, 300));
  }
  const plain = standings(week, games, members), comeback = standings(week, games, members, { dropWorst: true });
  assert.deepEqual(plain.map((r) => [r.user.id, r.total]), [[1, 67], [2, 45]]);   // six wins and a 2nd v five 2nds and a win
  assert.deepEqual(comeback.map((r) => [r.user.id, r.total, r.dropped]), [[1, 60, 7], [2, 45, 0]]);

  const recap = weeklyRecap(week, games, members, '2026-11-09', {});
  assert.match(recap, /🏆 Winner: P1 with 67 pts/);
  assert.match(recap, /Winning margin: 22 pts over P2/);
  assert.equal(weeklyRecap([], games, members, '2026-11-09', {}), null);
});

test('TimeGuessr: the dash share with five rounds, and the plain share', () => {
  const full = 'TimeGuessr #1263 — 39,647/50,000\n1️⃣ 🏆7,230 · 📅 13y · 🌍 6.3km\n2️⃣ 🏆9,901 · 📅 1y · 🌍 5.5km\n3️⃣ 🏆8,624 · 📅 0y · 🌍 584.0km\n4️⃣ 🏆9,766 · 📅 2y · 🌍 10.8km\n5️⃣ 🏆4,126 · 📅 33y · 🌍 632.7km';
  assert.equal(detectGame(full).score, 39647);
  assert.equal(detectGame('TimeGuessr #1263 39,647/50,000').score, 39647);
  assert.equal(detectGame(full.replace('39,647', '49,647')), null);   // rounds must add up
});

test('Pips: each level is its own board, lower time wins', () => {
  const e = detectGame('Pips #46 Easy 🟢\n0:31');
  assert.equal(e.game.id, 'pips-easy'); assert.equal(e.score, 31); assert.equal(e.game.higherBetter, false);
  assert.equal(detectGame('Pips #46 Medium 🟡\n2:05 🍪').game.id, 'pips-medium');
  assert.equal(detectGame('Pips #46 Hard 🔴\n12:40').score, 760);
});

test('Chainle share text', () => {
  const r = detectGame('Chainle #87 · 2,858 🔗\nBeat 44% of players\n🟧🟥🟩🟧🟨\nhttps://chainle.io');
  assert.equal(r.game.id, 'chainle'); assert.equal(r.puzzleNo, 87); assert.equal(r.score, 2858);
  assert.equal(detectGame('Chainle #87 · 2,858 🔗'), null);   // no squares, typed by hand
  assert.equal(builtin('queens'), null);
});

test('Chainle puzzle numbers follow the date', () => {
  assert.equal(expectedPuzzle(builtin('chainle'), '2026-11-14'), 87);
  assert.equal(expectedPuzzle(builtin('chainle'), '2026-11-20'), 93);
});

test('weekly recap: winner, final table, most wins, best and worst per game', async () => {
  const { weekRecap } = await import('../lib/records.js');
  const members = [{ id: 1, display_name: 'A' }, { id: 2, display_name: 'B' }];
  const games = { krillion: builtin('krillion'), wordle: builtin('wordle') };
  const s = (user_id, game_id, play_date, score) => ({ user_id, game_id, play_date, score });
  const scores = [
    s(1, 'krillion', '2026-11-09', 500), s(2, 'krillion', '2026-11-09', 300),
    s(1, 'krillion', '2026-11-10', 200), s(2, 'krillion', '2026-11-10', 450),
    s(1, 'wordle', '2026-11-10', 3), s(2, 'wordle', '2026-11-10', 7),
    s(1, 'krillion', '2026-11-16', 700),   // next week: not in the recap
  ];
  const r = weekRecap(scores, games, members, '2026-11-09', {});
  assert.equal(r.winners[0].id, 1);
  assert.deepEqual(r.table.map((x) => x.total), [27, 24]);
  const k = r.perGame.find((g) => g.game.id === 'krillion');
  assert.equal(k.best.value, 500); assert.equal(k.worst.value, 200); assert.equal(k.wins.value, 1);
  const w = r.perGame.find((g) => g.game.id === 'wordle');
  assert.equal(w.best.value, 3); assert.equal(w.worst.value, 7); assert.equal(w.best.users[0].id, 1);
  assert.equal(weekRecap(scores, games, members, '2026-11-02', {}), null);
});

test('Size It Up: the new "#98" share and the older dated share', () => {
  const now = 'Size It Up\n#98\n\nScore: 107/500\n\n⬜⬜⬜⬜⬜ 0\n🟥⬜⬜⬜⬜ 24\n🟥🟥🟥🟥⬜ 79\n⬜⬜⬜⬜⬜ 4\n⬜⬜⬜⬜⬜ 0\n\nhttps://magnitudle.com/size-it-up';
  assert.deepEqual(p('size-it-up', now), { puzzleNo: 98, score: 107 });
  assert.equal(p('size-it-up', now.replace('107/500', '307/500')), null);   // rows must add up
  assert.equal(expectedPuzzle(builtin('size-it-up'), '2026-11-16'), 99);
  const old = 'Magnitudle — Size It Up\n2026-11-14\nScore: 107/500\n⬜⬜⬜⬜⬜ 0\n🟥⬜⬜⬜⬜ 24\n🟥🟥🟥🟥⬜ 79\n⬜⬜⬜⬜⬜ 4\n⬜⬜⬜⬜⬜ 0';
  assert.deepEqual(p('size-it-up', old), { puzzleNo: 97, score: 107 });
});

test('admin deductions come off in any table that includes that day', () => {
  const members = [{ id: 1, display_name: 'A' }, { id: 2, display_name: 'B' }];
  const games = { wordle: builtin('wordle') };
  const scores = [{ user_id: 1, game_id: 'wordle', play_date: '2026-11-16', score: 3 }, { user_id: 2, game_id: 'wordle', play_date: '2026-11-16', score: 4 },
                  { user_id: 1, game_id: 'wordle', play_date: '2026-11-17', score: 3 }, { user_id: 2, game_id: 'wordle', play_date: '2026-11-17', score: 4 }];
  const deductions = [{ user_id: 1, date: '2026-11-17', points: 10 }];
  const week = standings(scores, games, members, { deductions });
  assert.deepEqual(week.map((r) => [r.user.id, r.total, r.penalty]), [[2, 14, 0], [1, 10, 10]]);
  const monday = standings(scores.filter((s) => s.play_date === '2026-11-16'), games, members, { deductions });
  assert.equal(monday.find((r) => r.user.id === 1).total, 10);   // the deduction is on Tuesday, not Monday
});

test('Noillirk: metres below 10 km, kilometres above', () => {
  const perfect = 'Noillirk 🎈 The Daily Climb · No. 52 · 14 km\n\n🟨🟨🟨🟨🟨🟨🟨\n\nPerfect climb. Every answer was the top answer.\n\nClimb today\'s prompts: https://playdaily.org/noillirk';
  assert.deepEqual(p('noillirk', perfect), { puzzleNo: 52, score: 14000 });
  assert.equal(formatScore(builtin('noillirk'), 14000), '14 km');
  assert.deepEqual(p('noillirk', perfect.replace('14 km', '10.4 km')), { puzzleNo: 52, score: 10400 });
  assert.deepEqual(p('noillirk', perfect.replace('14 km', '3,163m')), { puzzleNo: 52, score: 3163 });
  assert.equal(formatScore(builtin('noillirk'), 3163), '3,163 m');
  assert.equal(p('noillirk', perfect.replace('14 km', '4 km')), null);   // never shared as km under 10 km
  assert.equal(expectedPuzzle(builtin('noillirk'), '2026-11-17'), 52);
});

test('Hunch Daily Balance It: score, squares and link must agree', () => {
  const share = 'Hunch Daily Balance It #42\n367/500\n🟥🟩🟩🟧🟩\nhttps://hunchdaily.com/balance-game/daily/?day=42&s=367';
  assert.deepEqual(p('balance-it', share), { puzzleNo: 42, score: 367 });
  assert.equal(detectGame(share).game.id, 'balance-it');
  assert.equal(p('balance-it', share.replace('367/500', '467/500')), null);     // score edited, link disagrees
  assert.equal(p('balance-it', share.replace('🟥🟩🟩🟧🟩', '🟥🟩')), null);        // squares missing
  assert.equal(expectedPuzzle(builtin('balance-it'), '2026-11-20'), 42);
});

test('games vote is open Friday to Sunday, for the coming Monday', async () => {
  const { openBallotWeek } = await import('../lib/dates.js');
  assert.equal(openBallotWeek('2026-11-19'), null);            // Thursday
  assert.equal(openBallotWeek('2026-11-20'), '2026-11-23');    // Friday
  assert.equal(openBallotWeek('2026-11-22'), '2026-11-23');    // Sunday
  assert.equal(openBallotWeek('2026-11-23'), null);            // Monday: the vote has closed
});

test('games vote: 10 games max, most yes votes win, a tie at the cut goes to the admin', async () => {
  const { voteOutcome, MAX_GAMES } = await import('../lib/voterules.js');
  assert.equal(MAX_GAMES, 10);
  const g = (id, yes, no = 0) => ({ game: { id }, yes, no });
  // 12 games through, clear ranking: the two with the fewest yes votes are out
  let r = voteOutcome([...Array.from({ length: 10 }, (_, i) => g('a' + i, 5)), g('x', 2), g('y', 1)]);
  assert.deepEqual([r.inIds.length, r.outIds.sort(), r.tied], [10, ['x', 'y'], []]);
  // a tie for the last 2 places between 3 games: the admin picks 2
  r = voteOutcome([...Array.from({ length: 8 }, (_, i) => g('a' + i, 5)), g('t1', 3), g('t2', 3), g('t3', 3), g('z', 1)]);
  assert.deepEqual([r.inIds.length, r.tied.sort(), r.slots, r.outIds], [8, ['t1', 't2', 't3'], 2, ['z']]);
  // two "no" votes still rule a game out first, and 10 or fewer left need no ranking
  r = voteOutcome([g('a', 4, 2), g('b', 1)]);
  assert.deepEqual([r.inIds, r.outIds], [['b'], ['a']]);
});

test('handicap: starts from average points per day over the 4 weeks before', async () => {
  const { weeklyStarts } = await import('../lib/handicap.js');
  // three days of a new league: Cian ~18 a day, B ~12, C ~8
  const days = {
    '2026-11-11': { cian: 20, b: 12, c: 8 },
    '2026-11-12': { cian: 16, b: 14, c: 7 },
    '2026-11-13': { cian: 18, b: 10, c: 9, d: 30 },   // d played once: not enough days to count
  };
  const { starts, form } = weeklyStarts(days, '2026-11-16');
  // per day: cian 18, b 12, c 8 -> minus 0.75 × 7 × (avg - 8)
  assert.deepEqual(starts, { cian: -53, b: -21 });
  assert.equal(form.c.days, 3);
  assert.equal(form.d, undefined);
  // days in or after the week itself never count, and days over 4 weeks old drop out
  assert.deepEqual(weeklyStarts(days, '2026-11-12').starts, {});
  assert.deepEqual(weeklyStarts(days, '2026-12-28').starts, {});
});

test('handicap starting scores count in full in that week\'s table', () => {
  const members = [{ id: 1, display_name: 'A' }, { id: 2, display_name: 'B' }];
  const games = { wordle: builtin('wordle') };
  const s = (user_id, play_date, score) => ({ user_id, game_id: 'wordle', play_date, score });
  const scores = [s(1, '2026-11-16', 3), s(2, '2026-11-16', 5)];
  const bonus = [{ user_id: 1, week: '2026-11-16', weekly: -12 }];
  const t = standings(scores, games, members, { bonus });
  assert.deepEqual(t.map((r) => [r.user.id, r.total, r.bonus]), [[2, 7, 0], [1, -2, -12]]);
  // Monday morning, before anyone posts: the start shows when the table is for that week
  const empty = standings([], games, members, { bonus, forWeek: '2026-11-16' });
  assert.equal(empty.find((r) => r.user.id === 1).total, -12);
  assert.equal(standings([], games, members, { bonus }).find((r) => r.user.id === 1).total, 0);
});

test('a handicap week still has a winner when every total is 0 or below', async () => {
  const { weeklyWinners } = await import('../lib/records.js');
  const members = [{ id: 1, display_name: 'A' }, { id: 2, display_name: 'B' }];
  const games = { wordle: builtin('wordle') };
  const scores = [{ user_id: 1, game_id: 'wordle', play_date: '2026-11-16', score: 3 }, { user_id: 2, game_id: 'wordle', play_date: '2026-11-16', score: 4 }];
  const bonus = [{ user_id: 1, week: '2026-11-16', weekly: -30 }, { user_id: 2, week: '2026-11-16', weekly: -20 }];
  const w = weeklyWinners(scores, games, members, '2026-11-23', { bonus });
  assert.deepEqual(w.map((x) => [x.total, x.winners.map((u) => u.id)]), [[-13, [2]]]);   // A: 10-30, B: 7-20
});

test('games vote: the admin can put any game in or out whatever the votes say', async () => {
  const { voteOutcome } = await import('../lib/voterules.js');
  const g = (id, yes, no = 0, decision = null) => ({ game: { id }, yes, no, decision });
  const r = voteOutcome([g('loved', 3, 0, 'out'), g('hated', 0, 3, 'in'), g('normal', 2, 0), g('voted-off', 0, 2)]);
  assert.deepEqual([r.inIds.sort(), r.outIds.sort()], [['hated', 'normal'], ['loved', 'voted-off']]);
  // admin "in" games take places first; the votes fill what's left of the 10
  const many = Array.from({ length: 10 }, (_, i) => g('v' + i, 5));
  const r2 = voteOutcome([...many, g('pick', 0, 0, 'in')]);
  assert.deepEqual(r2.inIds, ['pick']);                 // the admin's pick is in first
  assert.equal(r2.tied.length, 10);                     // nine places left, ten games level on 5 yes: the admin picks
  assert.equal(r2.slots, 9);
  const r3 = voteOutcome([...many.slice(0, 8), g('low', 1), g('pick', 0, 0, 'in')]);
  assert.deepEqual([r3.inIds.length, r3.tied], [10, []]);
});
