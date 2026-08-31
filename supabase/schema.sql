-- Dungeon Crawl -- multi-tenant schema, Milestone 1.
--
-- Unlike the `rs` repo's Bingo feature (one hardcoded board, one shared
-- Supabase login whose RLS only distinguishes authenticated-vs-anon), every
-- table here is ownership-scoped: a host can only ever write to their own
-- challenge's rows, enforced by RLS, not app-level trust. Safe to re-run --
-- `create table if not exists` + `drop policy if exists` throughout.

-- One row per authenticated user (auth.users.id). Anyone can be a host of
-- their own challenges AND a player in other people's -- no separate
-- hosts/players tables, since both roles are just "an authenticated user."
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
drop policy if exists "public read" on profiles;
create policy "public read" on profiles for select using (true);
drop policy if exists "own row write" on profiles;
create policy "own row write" on profiles for all
  to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- A challenge/board a host runs. slug is the public URL segment
-- (dungeoncrawl.lol/c/<slug>). dink_secret is the per-challenge Dink
-- webhook token (Milestone 2) -- unlike rs's one-shared-URL-for-everyone
-- pattern, every challenge gets its own webhook URL so events route to the
-- right challenge without needing player-level auth on the webhook path.
-- board_type is deliberately an unconstrained text, not a CHECK enum --
-- v1 only ever sets 'grid5x5', but future irregular formats (e.g. a
-- dungeon hallway with rooms above/below) just need a new string and new
-- app code to interpret it, not a migration.
create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  slug text not null unique,
  board_type text not null default 'grid5x5',
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  dink_secret text not null unique default encode(gen_random_bytes(16), 'hex'),
  discord_webhook_url text,
  created_at timestamptz not null default now()
);

alter table challenges enable row level security;
drop policy if exists "public read" on challenges;
create policy "public read" on challenges for select using (true);
drop policy if exists "host writes own" on challenges;
create policy "host writes own" on challenges for all
  to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

-- One row per tile/room. `layout` is intentionally free-form jsonb: for
-- board_type='grid5x5' it holds {"row": 0-4, "col": 0-4}; a future
-- irregular board_type can store whatever positional/adjacency shape it
-- needs without a schema change. `condition` reuses the exact shape of
-- SeasonalTileCondition from rs/src/lib/seasonalBingoConditions.ts (ported
-- to src/lib/tileConditions.ts), just stored as data instead of hardcoded
-- TS so hosts can define their own tiles.
create table if not exists tiles (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  label text not null,
  icon text,
  layout jsonb not null default '{}',
  condition jsonb not null,
  created_at timestamptz not null default now()
);

alter table tiles enable row level security;
drop policy if exists "public read" on tiles;
create policy "public read" on tiles for select using (true);
drop policy if exists "host writes own challenge's tiles" on tiles;
create policy "host writes own challenge's tiles" on tiles for all
  to authenticated using (
    exists (select 1 from challenges c where c.id = tiles.challenge_id and c.host_id = auth.uid())
  ) with check (
    exists (select 1 from challenges c where c.id = tiles.challenge_id and c.host_id = auth.uid())
  );

-- A profile joining a specific challenge under a specific RSN. unique on
-- (challenge_id, profile_id) -- one join per profile per challenge for v1;
-- unique on (challenge_id, lower(rsn)) -- no two participants in the same
-- challenge can claim the same OSRS account.
create table if not exists challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  rsn text not null,
  joined_at timestamptz not null default now(),
  unique (challenge_id, profile_id),
  unique (challenge_id, lower(rsn))
);

alter table challenge_participants enable row level security;
drop policy if exists "public read" on challenge_participants;
create policy "public read" on challenge_participants for select using (true);
-- A profile can join/leave for themselves; a host can also manage their
-- own challenge's roster (e.g. remove a cheater).
drop policy if exists "self or host writes" on challenge_participants;
create policy "self or host writes" on challenge_participants for all
  to authenticated using (
    profile_id = auth.uid()
    or exists (select 1 from challenges c where c.id = challenge_participants.challenge_id and c.host_id = auth.uid())
  ) with check (
    profile_id = auth.uid()
    or exists (select 1 from challenges c where c.id = challenge_participants.challenge_id and c.host_id = auth.uid())
  );
