import { describe, expect, it } from 'vitest';
import { tileCompletionTitle, lineCompletionTitle, boardCompletionTitle, DEFAULT_TITLE_TEMPLATES, type TitleTemplates } from './discordTitles';

describe('tileCompletionTitle', () => {
  it('picks the right default slot for each (isBoss, isFirst) combination', () => {
    const base = { subject: '26 Limont', phrase: '500,000 total XP', bossLabel: 'a boss' };
    expect(tileCompletionTitle({ ...base, isFirst: true, isBoss: false })).toBe(
      '26 Limont was first to complete the 500,000 total XP task!',
    );
    expect(tileCompletionTitle({ ...base, isFirst: false, isBoss: false })).toBe(
      '26 Limont completed the 500,000 total XP task.',
    );
    expect(tileCompletionTitle({ ...base, isFirst: true, isBoss: true })).toBe(
      '26 Limont was first to defeat a boss -- the 500,000 total XP boss!',
    );
    expect(tileCompletionTitle({ ...base, isFirst: false, isBoss: true })).toBe(
      '26 Limont defeated a boss -- the 500,000 total XP boss.',
    );
  });

  it('substitutes an admin-edited template instead of the default', () => {
    const titles: TitleTemplates = { ...DEFAULT_TITLE_TEMPLATES, tileFirst: '⚡ {subject} SPEEDRAN {phrase}!' };
    const result = tileCompletionTitle(
      { isFirst: true, isBoss: false, subject: '26 Limont', phrase: '1,000 total boss KC', bossLabel: 'a boss' },
      titles,
    );
    expect(result).toBe('⚡ 26 Limont SPEEDRAN 1,000 total boss KC!');
  });
});

describe('lineCompletionTitle / boardCompletionTitle', () => {
  it('default to the hardcoded templates when none are passed', () => {
    expect(lineCompletionTitle('26 Limont')).toBe('26 Limont completed a line!');
    expect(boardCompletionTitle('26 Limont')).toBe('26 Limont completed the whole board!');
  });

  it('use an admin-edited template when passed', () => {
    const titles: TitleTemplates = { ...DEFAULT_TITLE_TEMPLATES, boardCompletion: '{subject} cleared the whole dungeon!!' };
    expect(boardCompletionTitle('otototo', titles)).toBe('otototo cleared the whole dungeon!!');
  });
});
