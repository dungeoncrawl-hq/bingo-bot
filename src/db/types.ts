import type { TileCondition } from '../lib/tileConditions.js';
import type { SnapshotRow } from '../lib/hiscoresRecap.js';

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
  is_site_admin: boolean;
  // A player's usual OSRS username, pre-filled into a challenge's join
  // form so they don't have to retype it every time. null until they set
  // one on the account page.
  default_rsn: string | null;
  // BACKLOG.md #20 -- opt-out for the "new feature" announcement emails,
  // defaulting to true. Unrelated to Supabase's own auth emails (magic
  // link/signup), which always send regardless of this flag.
  email_notifications: boolean;
  // BACKLOG.md #22 -- shown next to this player's rsn on leaderboards/
  // participant lists. null means none chosen (nothing shown, today's
  // behavior). Always one of profileIcons.ts's PROFILE_ICON_GROUPS
  // options -- never a freeform URL (see schema.sql's CHECK).
  icon_url: string | null;
  // BACKLOG.md #22 follow-up -- this player's chosen color (their
  // Adventure "who's here" chip background, their leaderboard text).
  // null means unset -- BoardPage.tsx falls back to a deterministic
  // per-participant hash from playerColors.ts's own palette in that
  // case, not a plain default color. Always one of PLAYER_COLORS (see
  // schema.sql's CHECK).
  color: string | null;
}

export interface Challenge {
  id: string;
  host_id: string;
  name: string;
  slug: string;
  board_type: string;
  // Only meaningful for board_type='adventure' ('small' today, the only
  // size built so far) -- null for every other board_type.
  board_size: string | null;
  // How the board is *scored* -- orthogonal to board_type, which is how
  // it's *shaped*. 'solo' matches every challenge's behavior before this
  // existed: each participant's own board, checked independently.
  game_mode: 'solo' | 'coop' | 'team';
  start_date: string;
  end_date: string;
  status: 'draft' | 'active' | 'ended';
  discord_webhook_url: string | null;
  // Opt-out, not opt-in -- defaults to true (see schema.sql), so a host
  // who never touches this setting still gets the daily pulse once a
  // webhook is connected. Only meaningful once discord_webhook_url is set.
  discord_daily_summary_enabled: boolean;
  created_at: string;
}

// One challenge's roster of teams (game_mode='team' only) -- not
// reusable across challenges, matching every other host-owned entity
// here.
export interface Team {
  id: string;
  challenge_id: string;
  name: string;
  created_at: string;
  // Always one of PLAYER_COLORS (see schema.sql's CHECK) -- never null
  // once the column exists (a chip needs *some* color to render), but
  // reads back as `undefined`/missing before the migration has run, so
  // callers should treat a falsy value the same as "not chosen yet".
  color: string | null;
  // One of PROFILE_ICON_GROUPS' URLs (same domain-prefix CHECK as
  // profiles.icon_url), or null for "not chosen yet" -- falls back to
  // the team name's first letter on its color, same idiom PlayerChip.tsx
  // already uses for a player with no icon.
  icon: string | null;
}

// BACKLOG.md #26 -- a co-host, who gets the same tile/team/participant
// management rights as the primary host (challenges.host_id) but can't
// delete the dungeon or manage other co-hosts. A co-host candidate must
// already be a challenge_participants row -- app code enforces this, not
// a schema constraint.
export interface ChallengeHost {
  challenge_id: string;
  profile_id: string;
  added_at: string;
}

// board_type='grid5x5' (today's Standard board).
export interface GridLayout {
  row: number;
  col: number;
}

// board_type='adventure' -- a branching path instead of a flat grid.
// 'center' marks a boss slot (see src/lib/adventureProgress.ts); 'top'/
// 'bottom' are the two lanes a participant picks between at a fork.
export interface AdventureLayout {
  column: number;
  lane: 'top' | 'bottom' | 'center';
}

export type TileLayout = GridLayout | AdventureLayout;

export interface Tile {
  id: string;
  challenge_id: string;
  label: string;
  icon: string | null;
  layout: TileLayout;
  condition: TileCondition;
  points: number;
  first_completer_bonus: number;
  created_at: string;
}

export interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  profile_id: string;
  rsn: string;
  joined_at: string;
  chosen_lowest_skill: string | null;
  // Only meaningful for an 'adventure' challenge -- fork index (as a
  // string key, e.g. "0") -> which lane this participant picked there.
  // See src/lib/adventureProgress.ts's resolveFrontier.
  adventure_path: Record<string, 'top' | 'bottom'>;
  // Only meaningful for game_mode='team' -- null until the host assigns
  // this participant to one of the challenge's teams.
  team_id: string | null;
  // Adventure logout-gated reset (BACKLOG.md #4) -- null means the
  // participant's next tile is locked, awaiting a qualifying Dink
  // LOGOUT event. Set together via the establish_adventure_baseline RPC
  // (never a plain client update -- see schema.sql's revoke).
  adventure_baseline_at: string | null;
  adventure_baseline_snapshot: SnapshotRow | null;
}

// BACKLOG.md #18 -- a submitted-by-anyone bug/suggestion note, reviewed
// only by the site admin (see schema.sql's RLS -- no public read).
export interface Feedback {
  id: string;
  profile_id: string;
  page_path: string | null;
  message: string;
  created_at: string;
  reviewed: boolean;
}

// BACKLOG.md #20 -- a site-admin-authored changelog entry. published_at
// null means it's a draft, invisible outside the admin page (see
// schema.sql's two-policy RLS split). emailed_at null means the one-time
// subscriber email blast for this entry hasn't gone out yet.
export interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
  published_at: string | null;
  emailed_at: string | null;
}
