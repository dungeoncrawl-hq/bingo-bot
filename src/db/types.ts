import type { TileCondition } from '../lib/tileConditions';

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

export interface Challenge {
  id: string;
  host_id: string;
  name: string;
  slug: string;
  board_type: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'active' | 'ended';
  dink_secret: string;
  discord_webhook_url: string | null;
  created_at: string;
}

export interface TileLayout {
  row: number;
  col: number;
}

export interface Tile {
  id: string;
  challenge_id: string;
  label: string;
  icon: string | null;
  layout: TileLayout;
  condition: TileCondition;
  created_at: string;
}

export interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  profile_id: string;
  rsn: string;
  joined_at: string;
}
