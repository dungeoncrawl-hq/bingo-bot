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
  -- Point value toward a challenge's leaderboard (Milestone: leaderboard).
  -- Defaults to 1 so an unweighted board (every tile worth the same)
  -- behaves exactly like a plain tile-completion count.
  points integer not null default 1,
  -- Extra points awarded on top of `points`, to whichever participant is
  -- first (earliest tile_completions row) to finish this tile. Defaults to
  -- 0 so an existing/unset tile behaves exactly as before -- no bonus.
  first_completer_bonus integer not null default 0,
  created_at timestamptz not null default now()
);

-- `create table if not exists` above is a no-op against an already-existing
-- production tiles table, so this ALTER is what actually lands the column
-- there -- safe to re-run.
alter table tiles add column if not exists points integer not null default 1;
alter table tiles add column if not exists first_completer_bonus integer not null default 0;

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
  -- This participant's tie-break pick for xpGainedLowestSkill/
  -- levelsGainedLowestSkill tiles (src/lib/tileConditions.ts), only
  -- meaningful when their baseline snapshot has more than one skill tied
  -- for lowest XP. null until they've chosen (or there's nothing to
  -- choose -- most participants never need this column at all).
  chosen_lowest_skill text,
  unique (challenge_id, profile_id)
);

-- `create table if not exists` above is a no-op against an already-existing
-- production challenge_participants table, so this ALTER is what actually
-- lands the column there -- safe to re-run.
alter table challenge_participants add column if not exists chosen_lowest_skill text;

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

-- Bucketing: a drop only gets its own row if it contains an item from the
-- curated catalog (src/lib/itemSets.ts -- the only source of items an
-- itemCount/itemSetCollected tile can ever reference) or its value clears
-- whatever threshold a challenge's own 'bigDropsCount' tile(s) actually
-- use (src/server/dinkWebhook.ts's handleLoot/minBigDropsThreshold).
-- Everything else folds into one running bucket row per participant per
-- day via increment_misc_loot below -- is_misc/recorded_on/drop_count/
-- max_single_value are only ever set on that one row per participant per
-- day; every other row leaves them at their defaults exactly as before
-- this change.
alter table loot_drops add column if not exists drop_count integer not null default 1;
alter table loot_drops add column if not exists is_misc boolean not null default false;
alter table loot_drops add column if not exists recorded_on date;
alter table loot_drops add column if not exists max_single_value bigint;

create unique index if not exists loot_drops_misc_daily_idx
  on loot_drops (participant_id, recorded_on)
  where is_misc;

-- Atomic increment for the misc bucket row -- a plain PostgREST PATCH can
-- only replace a column with a literal value, not add to it, so two
-- concurrent small drops would otherwise race. A single INSERT ... ON
-- CONFLICT DO UPDATE is atomic under Postgres without needing an explicit
-- transaction. max_single_value tracks the largest individual drop ever
-- folded into this bucket, so singleDropValue tiles stay correct even
-- when a big-but-untracked drop gets bucketed (its total_value is a sum
-- across many drops, not one drop's real value -- max_single_value is).
create or replace function increment_misc_loot(
  p_challenge_id uuid,
  p_participant_id uuid,
  p_recorded_on date,
  p_value bigint
) returns void
language sql
as $$
  insert into loot_drops (challenge_id, participant_id, source, items, total_value, max_single_value, is_misc, recorded_on, drop_count, created_at)
  values (p_challenge_id, p_participant_id, 'Misc', '[]'::jsonb, p_value, p_value, true, p_recorded_on, 1, now())
  on conflict (participant_id, recorded_on) where is_misc
  do update set
    total_value = loot_drops.total_value + excluded.total_value,
    max_single_value = greatest(loot_drops.max_single_value, excluded.max_single_value),
    drop_count = loot_drops.drop_count + 1,
    created_at = now();
$$;

-- Anti-abuse detection (backlog): a participant who leaves Dink's "send
-- screenshot" setting on has every notifier attach a full image to its
-- webhook POST -- extracted and immediately discarded today (see
-- dinkPayload.ts's own comment), but still costs inbound bandwidth/parse
-- time on every single event. These two columns are pure running totals,
-- no per-event history -- enough for a host to notice a repeat offender,
-- not a full audit log.
alter table challenge_participants add column if not exists screenshot_count integer not null default 0;
alter table challenge_participants add column if not exists screenshot_bytes bigint not null default 0;

-- Atomic increment for the screenshot counters above -- same reasoning as
-- increment_misc_loot above (a plain PostgREST PATCH can only replace a
-- column, not add to it, so concurrent screenshot events would otherwise
-- race). Returns the new running count so the caller
-- (src/server/dinkWebhook.ts) can log a milestone warning without a
-- second round trip.
create or replace function increment_screenshot_stats(
  p_participant_id uuid,
  p_bytes bigint
) returns integer
language sql
as $$
  update challenge_participants
  set screenshot_count = screenshot_count + 1,
      screenshot_bytes = screenshot_bytes + p_bytes
  where id = p_participant_id
  returning screenshot_count;
$$;

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

-- Site administration (BACKLOG.md #12): a single flag marking the site
-- owner, checked the same way challenges.host_id ownership already is --
-- no new role system, since there's exactly one admin. profiles' existing
-- "own row write" policy is `for all`, which would otherwise let any
-- authenticated user grant themselves this flag via a plain client-side
-- .update() -- explicitly revoke column-level UPDATE from `authenticated`
-- so only the service role (or the Supabase SQL editor) can ever flip it.
alter table profiles add column if not exists is_site_admin boolean not null default false;
revoke update (is_site_admin) on profiles from authenticated;

-- General webhook-call volume, not just screenshots -- answers "who's
-- generating traffic" and "is an ended challenge still getting hit,"
-- which screenshot_count/screenshot_bytes alone can't (those only fire
-- when a screenshot rides along). Bumped by increment_webhook_stats
-- below, called once per incoming Dink call regardless of event type.
alter table challenge_participants add column if not exists webhook_call_count integer not null default 0;
alter table challenge_participants add column if not exists last_webhook_at timestamptz;

create or replace function increment_webhook_stats(
  p_participant_id uuid
) returns void
language sql
as $$
  update challenge_participants
  set webhook_call_count = webhook_call_count + 1,
      last_webhook_at = now()
  where id = p_participant_id;
$$;

-- Same self-tamper concern as is_site_admin above: challenge_participants'
-- "self or host writes" policy is also `for all`, so without this a
-- participant could zero out their own screenshot/webhook counters via a
-- plain client update and erase the exact signal these columns exist to
-- surface. screenshot_count/screenshot_bytes had this same gap already --
-- closed here alongside the new columns rather than left inconsistent.
revoke update (screenshot_count, screenshot_bytes, webhook_call_count, last_webhook_at) on challenge_participants from authenticated;

-- Adventure mode (BACKLOG.md #7): a second board_type, a branching path
-- instead of the 5x5 grid. board_type itself needs no migration (already
-- unconstrained text -- see its own comment above); these two columns are
-- what a board_type='adventure' challenge additionally needs.
-- board_size stays unconstrained text too, same "no migration for a new
-- value" reasoning -- only 'small' exists today.
alter table challenges add column if not exists board_size text;
-- Keyed by fork index as a string ("0", "1", "2" for the small layout) ->
-- which lane ('top'/'bottom') the participant picked at that fork. A
-- participant writes their own pick directly (same trust level as the
-- existing chosen_lowest_skill column) -- challenge_participants' "self
-- or host writes" policy already covers it, no new RLS/revoke needed.
alter table challenge_participants add column if not exists adventure_path jsonb not null default '{}';

-- Coop/Team game modes (BACKLOG.md #10): orthogonal to board_type -- this
-- is how a board is *scored*, not shaped. 'solo' matches today's
-- behavior exactly (every participant's own board, checked
-- independently).
alter table challenges add column if not exists game_mode text not null default 'solo';

-- One challenge's roster of teams (Team mode only). Not reusable across
-- challenges, matching every other host-owned entity here (tiles,
-- webhook config, etc).
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table teams enable row level security;
drop policy if exists "public read" on teams;
create policy "public read" on teams for select using (true);
drop policy if exists "host writes own challenge's teams" on teams;
create policy "host writes own challenge's teams" on teams for all
  to authenticated using (
    exists (select 1 from challenges c where c.id = teams.challenge_id and c.host_id = auth.uid())
  ) with check (
    exists (select 1 from challenges c where c.id = teams.challenge_id and c.host_id = auth.uid())
  );

-- on delete set null: removing a team unassigns its members back to
-- "unassigned" rather than deleting the participants themselves.
-- challenge_participants' existing "self or host writes" policy already
-- covers the host writing this column (the same path that already
-- handles RSN edits) -- no new RLS needed.
alter table challenge_participants add column if not exists team_id uuid references teams(id) on delete set null;

-- Account/profile page (BACKLOG.md #9): a default RSN so a player
-- doesn't have to retype their username every time they join a new
-- challenge -- BoardPage.tsx's join form pre-fills from it. profiles'
-- existing "own row write" policy already covers a user writing their
-- own default_rsn, same as display_name -- no new RLS needed. Email
-- itself has no column here -- it lives on Supabase's own auth.users,
-- changed via supabase.auth.updateUser() from the client, not a table
-- write.
alter table profiles add column if not exists default_rsn text;

-- Adventure logout-gated baseline reset (BACKLOG.md #4): a tile's next
-- sibling stays locked and unevaluated until a qualifying Dink LOGOUT
-- event lands, whose forced on-demand hiscores resync becomes the new
-- baseline. adventure_baseline_snapshot is a literal frozen copy of
-- hiscoresRecap.ts's SnapshotRow shape at that moment, not a pointer to
-- re-fetch later -- participant_snapshots' row for that day can (and
-- will) get overwritten by a later sync, whether another logout or the
-- daily cron in participantSync.ts.
alter table challenge_participants add column if not exists adventure_baseline_at timestamptz;
alter table challenge_participants add column if not exists adventure_baseline_snapshot jsonb;

create or replace function establish_adventure_baseline(
  p_participant_id uuid,
  p_snapshot jsonb
) returns timestamptz
language sql
as $$
  update challenge_participants
  set adventure_baseline_at = now(),
      adventure_baseline_snapshot = p_snapshot
  where id = p_participant_id
  returning adventure_baseline_at;
$$;

create or replace function clear_adventure_baseline(p_participant_id uuid) returns void
language sql
as $$
  update challenge_participants
  set adventure_baseline_at = null, adventure_baseline_snapshot = null
  where id = p_participant_id;
$$;

-- Entirely server-controlled -- a participant should never be able to
-- grant themselves an instant baseline by PATCHing their own row
-- directly (challenge_participants' "self or host writes" policy is
-- `for all`). Same anti-tamper precedent as is_site_admin/
-- webhook_call_count earlier this session.
revoke update (adventure_baseline_at, adventure_baseline_snapshot) on challenge_participants from authenticated;
