import pg from 'pg';

// Return DATE as 'YYYY-MM-DD' strings, NUMERIC and BIGINT as numbers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

const SCHEMA = `
create table if not exists users (
  id serial primary key,
  username text unique not null,
  display_name text not null,
  pass_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token text primary key,
  user_id int not null references users(id) on delete cascade,
  expires timestamptz not null
);
create table if not exists custom_games (
  id serial primary key,
  name text not null,
  url text,
  higher_better boolean not null default false,
  unit text not null default 'pts',
  created_by int not null references users(id) on delete cascade
);
create table if not exists user_games (
  user_id int not null references users(id) on delete cascade,
  game_id text not null,
  primary key (user_id, game_id)
);
create table if not exists friendships (
  user_id int not null references users(id) on delete cascade,
  friend_id int not null references users(id) on delete cascade,
  status text not null default 'pending',
  primary key (user_id, friend_id)
);
create table if not exists leagues (
  id serial primary key,
  name text not null,
  code text unique not null,
  owner_id int not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists league_members (
  league_id int not null references leagues(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create table if not exists league_games (
  league_id int not null references leagues(id) on delete cascade,
  game_id text not null,
  primary key (league_id, game_id)
);
create table if not exists league_invites (
  league_id int not null references leagues(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  invited_by int not null references users(id) on delete cascade,
  primary key (league_id, user_id)
);
create table if not exists scores (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  game_id text not null,
  play_date date not null,
  score numeric not null,
  puzzle_no int,
  detail text,
  raw text,
  manual boolean not null default false,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, game_id, play_date)
);
create index if not exists scores_game_date on scores (game_id, play_date);
create table if not exists reactions (
  score_id int not null references scores(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  emoji text not null,
  primary key (score_id, user_id, emoji)
);
`;

const g = globalThis;

function getPool() {
  if (!g.__dlPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const local = /localhost|127\.0\.0\.1/.test(url);
    g.__dlPool = new pg.Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return g.__dlPool;
}

async function initializeSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Multiple server instances can start up against the same empty database.
    await client.query('select pg_advisory_xact_lock(194662611, 1)');
    await client.query(SCHEMA);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function q(text, params = []) {
  const pool = getPool();
  g.__dlReady ??= initializeSchema(pool).catch((error) => {
    g.__dlReady = undefined;
    throw error;
  });
  await g.__dlReady;
  const res = await pool.query(text, params);
  return res.rows;
}

export async function q1(text, params = []) {
  return (await q(text, params))[0] ?? null;
}
