import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { GAMES, customToGame } from '@/lib/games';
import { toggleGame, createCustomGame } from '../actions';
import { Flash } from '../ui';
import Submit from '../Submit';

export default async function GamesPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireUser('/games');
  const mine = new Set((await q('select game_id from user_games where user_id = $1', [user.id])).map((r) => r.game_id));
  // Custom games you made, play, or that one of your leagues uses.
  const custom = (await q(
    `select * from custom_games where created_by = $1
       or 'c' || id in (select game_id from user_games where user_id = $1)
       or 'c' || id in (select g.game_id from league_games g join league_members m on m.league_id = g.league_id where m.user_id = $1)
     order by name`,
    [user.id]
  )).map(customToGame);
  const all = [...GAMES, ...custom];

  return (
    <>
      <h1>Games</h1>
      <p className="muted">Choose the daily games you play. They show up on your Today page.</p>
      <Flash sp={sp} />
      <div className="list">
        {all.map((g) => (
          <form action={toggleGame} className="card list-row" key={g.id}>
            <input type="hidden" name="game" value={g.id} />
            <span className="emoji">{g.emoji}</span>
            <span className="grow">
              <b>{g.name}</b>
              <small className="muted">
                {g.higherBetter ? 'Higher is better' : 'Lower is better'}{g.custom ? ' · custom' : ''}
                {g.url && <> · <a href={g.url} target="_blank" rel="noreferrer">open ↗</a></>}
              </small>
            </span>
            <button className={'btn small' + (mine.has(g.id) ? '' : ' primary')}>{mine.has(g.id) ? 'Playing ✓' : 'Add'}</button>
          </form>
        ))}
      </div>

      <h2>Add a game that isn&apos;t listed</h2>
      <form action={createCustomGame} className="card stack">
        <label>Name<input name="name" required maxLength={40} placeholder="e.g. Pokedoku" /></label>
        <label>Link (optional)<input name="url" placeholder="https://…" /></label>
        <div className="row">
          <label className="grow">Scoring
            <select name="direction">
              <option value="lower">Lower wins</option>
              <option value="higher">Higher wins</option>
            </select>
          </label>
          <label>Unit<input name="unit" maxLength={12} placeholder="pts" size={6} /></label>
        </div>
        <Submit>Add game</Submit>
        <small className="muted">Custom games use hand-typed scores. You can add them to any league you own.</small>
      </form>
    </>
  );
}
