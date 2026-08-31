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
  unique (challenge_id, profile_id)
);

-- Table-level UNIQUE only accepts plain columns, not expressions like
-- lower(rsn) -- an expression index is the correct way to enforce
-- case-insensitive uniqueness in Postgres.
create unique index if not exists challenge_participants_challenge_rsn_key
  on challenge_participants (challenge_id, lower(rsn));

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

-- Auto-creates a profiles row the moment someone verifies a magic-link
-- sign-in (auth.users insert) -- a DB trigger rather than client-side
-- profile creation so the row always exists regardless of whether
-- whatever client code was running at that moment succeeded. Magic-link
-- auth only collects an email, so display_name defaults to the email's
-- local part; profile editing is a later milestone.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- One-time backfill for any auth.users row that predates the trigger above
-- (e.g. someone who signed in while this schema.sql was still being
-- iterated on) -- harmless/idempotent to leave in permanently, since
-- on conflict do nothing means it's a no-op once everyone's caught up.
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- Milestone 3: Dink webhook raw event tables + tile completions. Unlike
-- every table above, none of these get a client write policy -- not even
-- for the authenticated host. The only writer is the Dink webhook route,
-- which uses the Supabase service role key (bypasses RLS entirely) after
-- independently validating the per-challenge dink_secret. Public read only.

create table if not exists boss_kills (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references challenge_participants(id) on delete cascade,
  boss text not null,
  kc integer not null,
  is_personal_best boolean not null default false,
  best_time text,
  created_at timestamptz not null default now(),
  unique (participant_id, boss, kc)
);
alter table boss_kills enable row level security;
drop policy if exists "public read" on boss_kills;
create policy "public read" on boss_kills for select using (true);

create table if not exists slayer_tasks (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references challenge_participants(id) on delete cascade,
  monster text not null,
  kill_count integer,
  points integer not null,
  tasks_completed integer not null,
  created_at timestamptz not null default now(),
  unique (participant_id, tasks_completed)
);
alter table slayer_tasks enable row level security;
drop policy if exists "public read" on slayer_tasks;
create policy "public read" on slayer_tasks for select using (true);

-- No unique constraint -- dedup handled in app code (insertRowUnlessRecentDuplicate
-- in src/server/supabaseAdmin.ts), since a genuine duplicate drop (same
-- items/value/source within the same second) is vanishingly unlikely and
-- Dink is known to double-fire ~1.7s apart for the same event.
create table if not exists loot_drops (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references challenge_participants(id) on delete cascade,
  source text not null,
  items jsonb not null,
  total_value bigint not null,
  kill_count integer,
  created_at timestamptz not null default now()
);
alter table loot_drops enable row level security;
drop policy if exists "public read" on loot_drops;
create policy "public read" on loot_drops for select using (true);

create table if not exists deaths (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references challenge_participants(id) on delete cascade,
  value_lost bigint not null,
  is_pvp boolean not null default false,
  killer_name text,
  lost_items jsonb not null,
  created_at timestamptz not null default now()
);
alter table deaths enable row level security;
drop policy if exists "public read" on deaths;
create policy "public read" on deaths for select using (true);

create table if not exists collection_log_entries (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references challenge_participants(id) on delete cascade,
  item_name text not null,
  item_id integer,
  completed_entries integer,
  total_entries integer,
  created_at timestamptz not null default now(),
  unique (participant_id, item_name)
);
alter table collection_log_entries enable row level security;
drop policy if exists "public read" on collection_log_entries;
create policy "public read" on collection_log_entries for select using (true);

create table if not exists pet_obtains (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references challenge_participants(id) on delete cascade,
  boss_name text not null,
  updated_at timestamptz not null default now(),
  unique (participant_id, boss_name)
);
alter table pet_obtains enable row level security;
drop policy if exists "public read" on pet_obtains;
create policy "public read" on pet_obtains for select using (true);

-- Multi-tenant equivalent of rs's bingo_completions. kind/ref mirrors rs
-- exactly: ref is the tile id for kind='tile', the line's index into
-- gridLines() (as text) for kind='line', and 'board' for kind='board'.
create table if not exists tile_completions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references challenge_participants(id) on delete cascade,
  kind text not null check (kind in ('tile', 'line', 'board')),
  ref text not null,
  completed_at timestamptz not null default now(),
  unique (participant_id, challenge_id, kind, ref)
);
alter table tile_completions enable row level security;
drop policy if exists "public read" on tile_completions;
create policy "public read" on tile_completions for select using (true);

-- Milestone 4: periodic OSRS hiscores snapshots, for the tile condition
-- types Dink can't drive directly (xpGained, skillXpGained,
-- skillLevelGained, and every clue-scroll tier -- Dink has no continuous
-- XP tracker or clue-completion notifier). Multi-tenant equivalent of
-- rs's account_snapshots. Same idempotency as every table above: a
-- same-day resync overwrites that day's row via the unique constraint,
-- and there's no client write policy -- only the service-role sync route
-- (LOGOUT-triggered or the daily cron) can ever write here.
create table if not exists participant_snapshots (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references challenge_participants(id) on delete cascade,
  recorded_on date not null,
  total_level integer not null,
  total_xp bigint not null,
  skills jsonb not null,
  activities jsonb not null,
  unique (participant_id, recorded_on)
);
alter table participant_snapshots enable row level security;
drop policy if exists "public read" on participant_snapshots;
create policy "public read" on participant_snapshots for select using (true);
