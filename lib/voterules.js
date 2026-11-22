// The rules of the weekly games vote, kept free of the database so they can be tested.
export const MAX_GAMES = 10;     // a league plays at most this many games, so it never feels like a chore
export const NO_LIMIT = 2;       // this many "no" votes keep a game out

// items: [{ game: { id }, yes, no }]. A game with NO_LIMIT or more "no" votes is out. If more than MAX_GAMES are
// left, the ones with the most "yes" votes go through; a tie for the last places is the admin's call.
// The admin can override any game: decision 'in' puts it in whatever the votes say, 'out' keeps it out. Admin "in"
// games take places first; the votes fill the rest.
// Returns { inIds, outIds, tied, slots }: `tied` are the games tied for the last `slots` places (empty when none).
export function voteOutcome(items, max = MAX_GAMES) {
  const forcedIn = items.filter((i) => i.decision === 'in').map((i) => i.game.id).slice(0, max);
  const voted = items.filter((i) => !i.decision);
  const outIds = [...items.filter((i) => i.decision === 'out').map((i) => i.game.id), ...voted.filter((i) => i.no >= NO_LIMIT).map((i) => i.game.id)];
  const rest = voteRest(voted.filter((i) => i.no < NO_LIMIT).sort((a, b) => b.yes - a.yes), max - forcedIn.length);
  return { inIds: [...forcedIn, ...rest.inIds], outIds: [...outIds, ...rest.outIds], tied: rest.tied, slots: rest.slots };
}

function voteRest(left, max) {
  const outIds = [];
  if (max <= 0) return { inIds: [], outIds: left.map((i) => i.game.id), tied: [], slots: 0 };
  if (left.length <= max) return { inIds: left.map((i) => i.game.id), outIds, tied: [], slots: 0 };
  const cut = left[max - 1].yes;
  const clear = left.filter((i) => i.yes > cut), atCut = left.filter((i) => i.yes === cut), below = left.filter((i) => i.yes < cut);
  const slots = max - clear.length;
  outIds.push(...below.map((i) => i.game.id));
  if (atCut.length === slots) return { inIds: [...clear, ...atCut].map((i) => i.game.id), outIds, tied: [], slots: 0 };
  return { inIds: clear.map((i) => i.game.id), outIds, tied: atCut.map((i) => i.game.id), slots };
}
