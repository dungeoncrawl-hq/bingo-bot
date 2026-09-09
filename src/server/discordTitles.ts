// Admin-editable title text for Discord completion embeds
// (discordEmbeds.ts) -- the second half of BACKLOG.md #9, alongside
// discordBanter.ts's already-shipped flavor pools. Unlike a banter pool
// (many randomized variants, one picked per event), each title slot below
// is a single deterministic string -- there's exactly one title for a
// given (isBoss, isFirst) combination, so this is templated interpolation,
// not a pool to pick from. Kept in its own module for the same reason
// discordBanter.ts is: the joke/copy content shouldn't clutter
// discordEmbeds.ts's embed-assembly logic.
import { fill } from './discordBanter.js';

export interface TitleTemplates {
  tileFirst: string;
  tileNotFirst: string;
  bossFirst: string;
  bossNotFirst: string;
  lineCompletion: string;
  boardCompletion: string;
}

// Extracted as-is from discordEmbeds.ts's own inline ternary chain --
// byte-for-byte the titles this app has always posted, now just data
// instead of hardcoded string literals.
export const DEFAULT_TITLE_TEMPLATES: TitleTemplates = {
  tileFirst: '{subject} was first to complete the {phrase} task!',
  tileNotFirst: '{subject} completed the {phrase} task.',
  bossFirst: '{subject} was first to defeat {bossLabel} -- the {phrase} boss!',
  bossNotFirst: '{subject} defeated {bossLabel} -- the {phrase} boss.',
  lineCompletion: '{subject} completed a line!',
  boardCompletion: '{subject} completed the whole board!',
};

// pools defaults to DEFAULT_TITLE_TEMPLATES -- overridable so callers
// (tests, or a caller with a DB-fetched TitleTemplates from
// discordTitleStore.ts) can pin an exact template instead of the
// hardcoded default.
export function tileCompletionTitle(
  params: { isFirst: boolean; isBoss: boolean; subject: string; phrase: string; bossLabel: string },
  titles: TitleTemplates = DEFAULT_TITLE_TEMPLATES,
): string {
  const { isFirst, isBoss, subject, phrase, bossLabel } = params;
  const template = isBoss ? (isFirst ? titles.bossFirst : titles.bossNotFirst) : isFirst ? titles.tileFirst : titles.tileNotFirst;
  return fill(template, { subject, phrase, bossLabel });
}

export function lineCompletionTitle(subject: string, titles: TitleTemplates = DEFAULT_TITLE_TEMPLATES): string {
  return fill(titles.lineCompletion, { subject });
}

export function boardCompletionTitle(subject: string, titles: TitleTemplates = DEFAULT_TITLE_TEMPLATES): string {
  return fill(titles.boardCompletion, { subject });
}
