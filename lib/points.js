// Rank-based league scoring.
// For each day and each game, league members who submitted are ranked against each other.
// 1st: 10, 2nd: 7, 3rd: 5, 4th: 4, 5th: 3, 6th: 2, everyone else who played: 1.
// Ties share the better place.
export const POINTS = [10, 7, 5, 4, 3, 2];
export const PLAYED_POINTS = 1;

// entries: [{ user_id, score }] for one game on one day -> Map(user_id -> { rank, points })
export function rankDay(entries, higherBetter) {
  const out = new Map();
  for (const e of entries) {
    const better = entries.filter((o) => (higherBetter ? o.score > e.score : o.score < e.score)).length;
    const rank = better + 1;
    out.set(e.user_id, { rank, points: POINTS[rank - 1] ?? PLAYED_POINTS });
  }
  return out;
}

// scores: rows { user_id, game_id, play_date, score }; games: { id: game }; members: [{ id, ... }]
// Returns rows sorted best-first, each with a total and a per-game breakdown.
export function standings(scores, games, members) {
  const rows = new Map(
    members.map((m) => [m.id, { user: m, total: 0, played: 0, wins: 0, byGame: {} }])
  );
  const groups = new Map();
  for (const s of scores) {
    if (!games[s.game_id] || !rows.has(s.user_id)) continue;
    const key = s.game_id + '|' + s.play_date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  for (const [key, entries] of groups) {
    const gameId = key.split('|')[0];
    const ranked = rankDay(entries, games[gameId].higherBetter);
    for (const e of entries) {
      const { rank, points } = ranked.get(e.user_id);
      const row = rows.get(e.user_id);
      const g = (row.byGame[gameId] ??= { points: 0, played: 0, wins: 0, sum: 0 });
      row.total += points; row.played++; g.points += points; g.played++; g.sum += e.score;
      // A win needs someone to beat.
      if (rank === 1 && entries.length > 1) { row.wins++; g.wins++; }
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.total - a.total || b.wins - a.wins || b.played - a.played ||
      a.user.display_name.localeCompare(b.user.display_name)
  );
}

// Standings for a single game, reusing the same shape.
export function gameStandings(scores, game, members) {
  const rows = standings(scores.filter((s) => s.game_id === game.id), { [game.id]: game }, members);
  return rows.map((r) => {
    const g = r.byGame[game.id];
    return { ...r, avg: g ? g.sum / g.played : null };
  });
}

// Add a `pos` to sorted rows; equal totals share a position.
export function withPositions(rows) {
  let pos = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.total !== rows[i - 1].total) pos = i + 1;
    return { ...r, pos };
  });
}
