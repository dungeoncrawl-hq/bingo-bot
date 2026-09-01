// Preset boss/minigame/raid names a host picks from for a kcGained tile --
// the only way to populate one, no freeform typing (see TileEditorForm.tsx).
// Source of truth: the Jagex OSRS Hiscores "activities" list itself (every
// entry here is copied verbatim from a live index_lite.json response), minus
// the non-boss entries (Bounty Hunter, Clue Scrolls, League Points, etc. --
// see rs/src/lib/activities.ts's NON_BOSS_ACTIVITIES, the same exclusion set
// this was filtered against). This exact spelling is what matters: Dink's
// KILL_COUNT webhook event reports `boss` using this same Hiscores naming
// (see kcGainedByActivity in participantStats.ts, which does an exact-string
// match against it), so a name here that doesn't match Hiscores exactly
// means that tile can simply never complete.
//
// Icon precedence: a boss/raid's own pet (from rs/src/lib/petIcons.ts's
// PET_ICON_FILE, already wiki-verified/production-tested there) whenever it
// has one -- immediately recognizable, and consistent with how this catalog
// itself was scoped (see the Scurrius example that kicked this off). The 9
// entries with no pet get a hand-picked, individually wiki-verified unique
// item icon instead (e.g. Barrows Chests -> Dharok's platebody).
const WIKI = 'https://oldschool.runescape.wiki/images/';

export interface BossActivity {
  name: string;
  icon: string;
}

export const BOSS_ACTIVITIES: BossActivity[] = [
  { name: 'Abyssal Sire', icon: `${WIKI}Abyssal_orphan_(follower).png` },
  { name: 'Alchemical Hydra', icon: `${WIKI}Ikkle_Hydra_(follower,_serpentine).png` },
  { name: 'Amoxliatl', icon: `${WIKI}Moxi_(follower).png` },
  { name: 'Araxxor', icon: `${WIKI}Nid_(follower).png` },
  { name: 'Artio', icon: `${WIKI}Callisto_cub_(follower).png` },
  { name: 'Barrows Chests', icon: `${WIKI}Dharok's_platebody.png` },
  { name: 'Brutus', icon: `${WIKI}Beef_(follower).png` },
  { name: 'Bryophyta', icon: `${WIKI}Bryophyta's_staff.png` },
  { name: 'Callisto', icon: `${WIKI}Callisto_cub_(follower).png` },
  { name: "Calvar'ion", icon: `${WIKI}Vet'ion_Jr._(follower).png` },
  { name: 'Cerberus', icon: `${WIKI}Hellpuppy_(follower).png` },
  { name: 'Chambers of Xeric', icon: `${WIKI}Olmlet_(follower).png` },
  { name: 'Chambers of Xeric: Challenge Mode', icon: `${WIKI}Olmlet_(follower).png` },
  { name: 'Chaos Elemental', icon: `${WIKI}Chaos_Elemental_Jr..png` },
  { name: 'Chaos Fanatic', icon: `${WIKI}Chaos_Elemental_Jr..png` },
  { name: 'Commander Zilyana', icon: `${WIKI}Zilyana_Jr..png` },
  { name: 'Corporeal Beast', icon: `${WIKI}Dark_core.png` },
  { name: 'Crazy Archaeologist', icon: `${WIKI}Fedora.png` },
  { name: 'Dagannoth Prime', icon: `${WIKI}Dagannoth_Prime_Jr..png` },
  { name: 'Dagannoth Rex', icon: `${WIKI}Dagannoth_Rex_Jr..png` },
  { name: 'Dagannoth Supreme', icon: `${WIKI}Dagannoth_Supreme_Jr..png` },
  { name: 'Deranged Archaeologist', icon: `${WIKI}Fremennik_kilt.png` },
  { name: 'Doom of Mokhaiotl', icon: `${WIKI}Dom_(follower).png` },
  { name: 'Duke Sucellus', icon: `${WIKI}Baron_(follower).png` },
  { name: 'General Graardor', icon: `${WIKI}General_Graardor_Jr..png` },
  { name: 'Giant Mole', icon: `${WIKI}Baby_Mole_(follower).png` },
  { name: 'Grotesque Guardians', icon: `${WIKI}Noon_(follower).png` },
  { name: 'Hespori', icon: `${WIKI}Bottomless_compost_bucket.png` },
  { name: 'Kalphite Queen', icon: `${WIKI}Kalphite_Princess_(follower,_walking).png` },
  { name: 'King Black Dragon', icon: `${WIKI}Prince_Black_Dragon_(follower).png` },
  { name: 'Kraken', icon: `${WIKI}Pet_Kraken_(follower).png` },
  { name: "Kree'Arra", icon: `${WIKI}Kree'arra_Jr..png` },
  { name: "K'ril Tsutsaroth", icon: `${WIKI}K'ril_Tsutsaroth_Jr..png` },
  { name: 'Lunar Chests', icon: `${WIKI}Blood_moon_helm.png` },
  { name: 'Mad Angel', icon: `${WIKI}Aggy_(follower).png` },
  { name: 'Maggot King', icon: `${WIKI}Maggot_marquess_(follower).png` },
  { name: 'Mimic', icon: `${WIKI}Trouver_parchment.png` },
  { name: 'Nex', icon: `${WIKI}Nexling_(follower).png` },
  { name: 'Nightmare', icon: `${WIKI}Little_Nightmare_(follower).png` },
  { name: 'Obor', icon: `${WIKI}Hill_giant_club.png` },
  { name: 'Phantom Muspah', icon: `${WIKI}Muphin_(follower,_ranged).png` },
  { name: "Phosani's Nightmare", icon: `${WIKI}Little_Nightmare_(follower).png` },
  { name: 'Rifts closed', icon: `${WIKI}Abyssal_lantern.png` },
  { name: 'Sarachnis', icon: `${WIKI}Sraracha_(follower).png` },
  { name: 'Scorpia', icon: `${WIKI}Scorpia's_offspring_(follower).png` },
  { name: 'Scurrius', icon: `${WIKI}Scurry_(follower).png` },
  { name: 'Shellbane Gryphon', icon: `${WIKI}Gull_(follower).png` },
  { name: 'Skotizo', icon: `${WIKI}Skotos_(follower).png` },
  { name: 'Sol Heredit', icon: `${WIKI}Smol_Heredit_(follower).png` },
  { name: 'Spindel', icon: `${WIKI}Venenatis_spiderling_(follower).png` },
  { name: 'Tempoross', icon: `${WIKI}Tiny_Tempor.png` },
  { name: 'The Corrupted Gauntlet', icon: `${WIKI}Youngllef_(follower).png` },
  { name: 'The Gauntlet', icon: `${WIKI}Youngllef_(follower).png` },
  { name: 'The Hueycoatl', icon: `${WIKI}Huberte_(follower).png` },
  { name: 'The Leviathan', icon: `${WIKI}Lil'viathan_(follower).png` },
  { name: 'The Royal Titans', icon: `${WIKI}Bran_(follower).png` },
  { name: 'The Whisperer', icon: `${WIKI}Wisp_(follower).png` },
  { name: 'Theatre of Blood', icon: `${WIKI}Lil'_Zik_(follower).png` },
  { name: 'Theatre of Blood: Hard Mode', icon: `${WIKI}Lil'_Zik_(follower).png` },
  { name: 'Thermonuclear Smoke Devil', icon: `${WIKI}Smoke_Devil_(follower).png` },
  { name: 'Tombs of Amascut', icon: `${WIKI}Tumeken's_Guardian_(follower).png` },
  { name: 'Tombs of Amascut: Expert Mode', icon: `${WIKI}Tumeken's_Guardian_(follower).png` },
  { name: 'TzKal-Zuk', icon: `${WIKI}Jal-Nib-Rek_(follower).png` },
  { name: 'TzTok-Jad', icon: `${WIKI}TzRek-Jad_(follower).png` },
  { name: 'Vardorvis', icon: `${WIKI}Butch_(follower).png` },
  { name: 'Venenatis', icon: `${WIKI}Venenatis_spiderling_(follower).png` },
  { name: "Vet'ion", icon: `${WIKI}Vet'ion_Jr._(follower).png` },
  { name: 'Vorkath', icon: `${WIKI}Vorki_(follower).png` },
  { name: 'Wintertodt', icon: `${WIKI}Phoenix_(follower).png` },
  { name: 'Yama', icon: `${WIKI}Yami_(follower).png` },
  { name: 'Zalcano', icon: `${WIKI}Smolcano_(follower).png` },
  { name: 'Zulrah', icon: `${WIKI}Snakeling.png` },
];

const ICON_BY_NAME = new Map(BOSS_ACTIVITIES.map((b) => [b.name, b.icon]));

export function bossActivityIcon(activity: string): string | null {
  return ICON_BY_NAME.get(activity) ?? null;
}
