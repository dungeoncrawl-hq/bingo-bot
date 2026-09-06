// Every OSRS pet's wiki icon, for the profile-icon picker's "Pets" group
// (ProfileIconPicker.tsx/profileIcons.ts) -- ported from rs/src/lib/petIcons.ts,
// which sources these from the OSRS Wiki "Pet" page's boss/skilling/other
// pet tables and has them wiki-verified and production-tested there
// already. Trimmed down to just the icon catalog: this app has no
// per-pet Dink tracking (petsObtained is a plain counter, not a specific-
// pet log), so rs's Dink-name reverse-lookup machinery doesn't apply here.
const WIKI = 'https://oldschool.runescape.wiki/images/';

const PET_ICON_FILE: Record<string, string> = {
  'Abyssal Sire': 'Abyssal_orphan_(follower).png',
  'Alchemical Hydra': 'Ikkle_Hydra_(follower,_serpentine).png',
  Amoxliatl: 'Moxi_(follower).png',
  Araxxor: 'Nid_(follower).png',
  Artio: 'Callisto_cub_(follower).png',
  Brutus: 'Beef_(follower).png',
  Callisto: 'Callisto_cub_(follower).png',
  "Calvar'ion": "Vet'ion_Jr._(follower).png",
  Cerberus: 'Hellpuppy_(follower).png',
  'Chambers of Xeric': 'Olmlet_(follower).png',
  'Chambers of Xeric: Challenge Mode': 'Olmlet_(follower).png',
  'Chaos Elemental': 'Chaos_Elemental_Jr..png',
  'Chaos Fanatic': 'Chaos_Elemental_Jr..png',
  'Commander Zilyana': 'Zilyana_Jr..png',
  'Corporeal Beast': 'Dark_core.png',
  'Dagannoth Prime': 'Dagannoth_Prime_Jr..png',
  'Dagannoth Rex': 'Dagannoth_Rex_Jr..png',
  'Dagannoth Supreme': 'Dagannoth_Supreme_Jr..png',
  'Doom of Mokhaiotl': 'Dom_(follower).png',
  'Duke Sucellus': 'Baron_(follower).png',
  'General Graardor': 'General_Graardor_Jr..png',
  'Giant Mole': 'Baby_Mole_(follower).png',
  'Grotesque Guardians': 'Noon_(follower).png',
  'Kalphite Queen': 'Kalphite_Princess_(follower,_walking).png',
  'King Black Dragon': 'Prince_Black_Dragon_(follower).png',
  Kraken: 'Pet_Kraken_(follower).png',
  "Kree'Arra": "Kree'arra_Jr..png",
  "K'ril Tsutsaroth": "K'ril_Tsutsaroth_Jr..png",
  'Mad Angel': 'Aggy_(follower).png',
  'Maggot King': 'Maggot_marquess_(follower).png',
  Nex: 'Nexling_(follower).png',
  Nightmare: 'Little_Nightmare_(follower).png',
  "Phosani's Nightmare": 'Little_Nightmare_(follower).png',
  'Phantom Muspah': 'Muphin_(follower,_ranged).png',
  Sarachnis: 'Sraracha_(follower).png',
  Scorpia: "Scorpia's_offspring_(follower).png",
  Scurrius: 'Scurry_(follower).png',
  'Shellbane Gryphon': 'Gull_(follower).png',
  Skotizo: 'Skotos_(follower).png',
  'Sol Heredit': 'Smol_Heredit_(follower).png',
  Spindel: 'Venenatis_spiderling_(follower).png',
  Tempoross: 'Tiny_Tempor.png',
  'The Corrupted Gauntlet': 'Youngllef_(follower).png',
  'The Gauntlet': 'Youngllef_(follower).png',
  'The Hueycoatl': 'Huberte_(follower).png',
  'The Leviathan': "Lil'viathan_(follower).png",
  'The Royal Titans': 'Bran_(follower).png',
  'The Whisperer': 'Wisp_(follower).png',
  'Theatre of Blood': "Lil'_Zik_(follower).png",
  'Theatre of Blood: Hard Mode': "Lil'_Zik_(follower).png",
  'Thermonuclear Smoke Devil': 'Smoke_Devil_(follower).png',
  'Tombs of Amascut': "Tumeken's_Guardian_(follower).png",
  'Tombs of Amascut: Expert Mode': "Tumeken's_Guardian_(follower).png",
  'TzKal-Zuk': 'Jal-Nib-Rek_(follower).png',
  'TzTok-Jad': 'TzRek-Jad_(follower).png',
  Vardorvis: 'Butch_(follower).png',
  Venenatis: 'Venenatis_spiderling_(follower).png',
  "Vet'ion": "Vet'ion_Jr._(follower).png",
  Vorkath: 'Vorki_(follower).png',
  Wintertodt: 'Phoenix_(follower).png',
  Yama: 'Yami_(follower).png',
  Zalcano: 'Smolcano_(follower).png',
  Zulrah: 'Snakeling.png',
};

const SKILLING_PET_ICON_FILE: Record<string, string> = {
  Beaver: 'Beaver.png',
  'Rock Golem': 'Rock_golem.png',
  Heron: 'Heron.png',
  Tangleroot: 'Tangleroot.png',
  'Baby Chinchompa': 'Baby_chinchompa_(grey).png',
  'Giant Squirrel': 'Giant_Squirrel.png',
  Rocky: 'Rocky.png',
  'Rift Guardian': 'Rift_guardian_(fire).png',
  Soup: 'Soup.png',
  Herbi: 'Herbi.png',
};

const OTHER_PET_ICON_FILE: Record<string, string> = {
  Bloodhound: 'Bloodhound.png',
  'Chompy Chick': 'Chompy_chick.png',
  Broav: 'Broav.png',
  Quetzin: 'Quetzin.png',
  'Abyssal Protector': 'Abyssal_protector.png',
  Archibald: 'Archibald.png',
};

export type PetCategory = 'Boss' | 'Skilling' | 'Other';

export interface PetEntry {
  name: string;
  icon: string;
  category: PetCategory;
}

// PET_ICON_FILE is keyed by boss name, not the pet's own name -- several
// reskinned boss pairs (Artio/Callisto, Spindel/Venenatis, the two
// Gauntlet variants, Chaos Elemental/Chaos Fanatic, the two Chambers of
// Xeric variants) share one literal pet, so keying a picker entry by boss
// name would show the same icon twice under two different labels. Derives
// the real pet name from its icon filename instead (stripping the
// "(follower...)" suffix and extension) and dedupes by icon URL so each
// distinct pet appears exactly once, labeled correctly either way.
function petNameFromFile(file: string): string {
  return file
    .replace(/\.(png|gif|webp)$/i, '')
    .replace(/_\([^)]*\)$/i, '')
    .replace(/_/g, ' ');
}

function bossPetEntries(map: Record<string, string>): PetEntry[] {
  const seen = new Set<string>();
  const entries: PetEntry[] = [];
  for (const file of Object.values(map)) {
    if (seen.has(file)) continue;
    seen.add(file);
    entries.push({ name: petNameFromFile(file), icon: `${WIKI}${file}`, category: 'Boss' });
  }
  return entries;
}

// Skilling/other pets have no such collision -- their map keys are
// already the pet's own real name.
function namedPetEntries(map: Record<string, string>, category: PetCategory): PetEntry[] {
  return Object.entries(map).map(([name, file]) => ({ name, icon: `${WIKI}${file}`, category }));
}

// Boss pets first (existing order), then skilling, then other -- same
// ordering rs's own AccountPage uses for its Pets section.
export const ALL_PETS: PetEntry[] = [
  ...bossPetEntries(PET_ICON_FILE),
  ...namedPetEntries(SKILLING_PET_ICON_FILE, 'Skilling'),
  ...namedPetEntries(OTHER_PET_ICON_FILE, 'Other'),
];
