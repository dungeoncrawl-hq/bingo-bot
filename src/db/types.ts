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
  dink_secret: string;
  discord_webhook_url: string | null;
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
