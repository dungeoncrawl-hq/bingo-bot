// OSRS Hiscores fetch -- runs server-side only (the Jagex endpoint has no
// CORS headers, so this can't be called directly from the browser). Ported
// near-verbatim from rs/src/server/hiscores.ts -- pure OSRS API
// integration, nothing rs-specific.

export interface SkillStat {
  level: number;
  xp: number;
}

export interface ActivityStat {
  rank: number;
  score: number;
}

export interface HiscoresData {
  skills: Record<string, SkillStat>;
  activities: Record<string, ActivityStat>;
}

// Tried in order. The plain endpoint covers most accounts, but the
// ironman-mode variants are kept as a fallback for the accounts that only
// resolve there.
const ENDPOINTS = [
  'hiscore_oldschool',
  'hiscore_oldschool_ironman',
  'hiscore_oldschool_hardcore_ironman',
  'hiscore_oldschool_ultimate',
];

interface RawSkill { id: number; name: string; rank: number; level: number; xp: number }
interface RawActivity { id: number; name: string; rank: number; score: number }
interface RawResponse { name: string; skills: RawSkill[]; activities: RawActivity[] }

function normalize(json: RawResponse): HiscoresData {
  const skills: Record<string, SkillStat> = {};
  for (const s of json.skills ?? []) {
    if (s.name === 'Overall') continue;
    skills[s.name] = { level: s.level, xp: s.xp < 0 ? 0 : s.xp };
  }
  const activities: Record<string, ActivityStat> = {};
  for (const a of json.activities ?? []) {
    activities[a.name] = { rank: a.rank, score: a.score < 0 ? 0 : a.score };
  }
  return { skills, activities };
}

export async function fetchHiscores(rsn: string): Promise<HiscoresData> {
  const encoded = encodeURIComponent(rsn);
  let lastStatus: number | undefined;
  for (const endpoint of ENDPOINTS) {
    const res = await fetch(`https://secure.runescape.com/m=${endpoint}/index_lite.json?player=${encoded}`);
    if (res.ok) {
      const json = (await res.json()) as RawResponse;
      return normalize(json);
    }
    lastStatus = res.status;
  }
  throw new Error(`No hiscores found for "${rsn}" (last status ${lastStatus})`);
}
