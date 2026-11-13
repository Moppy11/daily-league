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
alter table users add column if not exists stats_visibility text not null default 'friends';
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
alter table league_members add column if not exists chat_seen_id int not null default 0;
create table if not exists league_messages (
  id serial primary key,
  league_id int not null references leagues(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  kind text not null default 'chat',
  body text not null default '',
  game_id text,
  status text,
  created_at timestamptz not null default now()
);
create index if not exists league_messages_league on league_messages (league_id, id);
create table if not exists notifications (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  kind text not null,
  body text not null,
  link text not null default '/',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user on notifications (user_id, id);
alter table users add column if not exists recovery_hash text;
alter table leagues add column if not exists is_public boolean not null default false;
alter table leagues add column if not exists drop_worst boolean not null default false;
alter table leagues add column if not exists daily_cap int;
alter table league_games add column if not exists weight int not null default 1;
create table if not exists score_flags (
  score_id int not null references scores(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  primary key (score_id, user_id)
);
alter table score_flags add column if not exists league_id int references leagues(id) on delete cascade;
create table if not exists league_exclusions (
  league_id int not null references leagues(id) on delete cascade,
  score_id int not null references scores(id) on delete cascade,
  primary key (league_id, score_id)
);
create table if not exists duels (
  id serial primary key,
  challenger_id int not null references users(id) on delete cascade,
  opponent_id int not null references users(id) on delete cascade,
  game_id text not null,
  week_start date not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create table if not exists blocks (
  user_id int not null references users(id) on delete cascade,
  blocked_id int not null references users(id) on delete cascade,
  primary key (user_id, blocked_id)
);
create table if not exists message_reports (
  message_id int not null references league_messages(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  primary key (message_id, user_id)
);
create table if not exists push_subs (
  endpoint text primary key,
  user_id int not null references users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table if not exists app_settings (key text primary key, value text not null);
create table if not exists proofs (
  score_id int primary key references scores(id) on delete cascade,
  mime text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create unique index if not exists league_recap_once on league_messages (league_id, game_id) where kind = 'recap';
alter table users add column if not exists email text;
create unique index if not exists users_email on users (lower(email)) where email is not null;
create table if not exists password_resets (
  token_hash text primary key,
  user_id int not null references users(id) on delete cascade,
  expires timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
-- The day (in the player's own time zone) they joined a league; results from that day on count there.
alter table league_members add column if not exists joined_on date;
update league_members set joined_on = (joined_at at time zone 'UTC')::date where joined_on is null;
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
