import { describe, expect, it } from 'vitest';
import { computeFirstCompleters } from './firstCompletions';

describe('computeFirstCompleters', () => {
  it('returns nothing for an empty completion list', () => {
    expect(computeFirstCompleters([])).toEqual({});
  });

  it('credits the sole completer of a tile', () => {
    const result = computeFirstCompleters([
      { kind: 'tile', ref: 't1', participant_id: 'a', completed_at: '2026-08-31T10:00:00Z' },
    ]);
    expect(result).toEqual({ t1: 'a' });
  });

  it('picks the earliest completed_at across multiple participants', () => {
    const result = computeFirstCompleters([
      { kind: 'tile', ref: 't1', participant_id: 'b', completed_at: '2026-08-31T12:00:00Z' },
      { kind: 'tile', ref: 't1', participant_id: 'a', completed_at: '2026-08-31T09:00:00Z' },
      { kind: 'tile', ref: 't1', participant_id: 'c', completed_at: '2026-08-31T15:00:00Z' },
    ]);
    expect(result).toEqual({ t1: 'a' });
  });

  it('ignores non-tile completions (line/board)', () => {
    const result = computeFirstCompleters([
      { kind: 'board', ref: 'board', participant_id: 'a', completed_at: '2026-08-31T09:00:00Z' },
      { kind: 'line', ref: '0', participant_id: 'a', completed_at: '2026-08-31T09:00:00Z' },
    ]);
    expect(result).toEqual({});
  });

  it('tracks multiple tiles independently', () => {
    const result = computeFirstCompleters([
      { kind: 'tile', ref: 't1', participant_id: 'a', completed_at: '2026-08-31T09:00:00Z' },
      { kind: 'tile', ref: 't2', participant_id: 'b', completed_at: '2026-08-31T10:00:00Z' },
    ]);
    expect(result).toEqual({ t1: 'a', t2: 'b' });
  });
});
