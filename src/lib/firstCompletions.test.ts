import { describe, expect, it } from 'vitest';
import { computeAdventureFirstCompleters, computeFirstCompleters } from './firstCompletions';

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

describe('computeAdventureFirstCompleters', () => {
  // Real production report: WheresMyGear and 26 Limont both took Room
  // 3's fork through different lanes (top/bottom tiles, same column),
  // and both showed as "first" for the room -- one per tile, since
  // each was the sole completer of their own lane's tile.
  it('credits only the earliest completer of a room, not each lane independently', () => {
    const tiles = [
      { id: 'top', layout: { column: 3 } },
      { id: 'bottom', layout: { column: 3 } },
    ];
    const result = computeAdventureFirstCompleters(
      [
        { kind: 'tile', ref: 'top', participant_id: 'wheresmygear', completed_at: '2026-09-03T17:14:09Z' },
        { kind: 'tile', ref: 'bottom', participant_id: 'limont', completed_at: '2026-09-03T19:05:54Z' },
      ],
      tiles,
    );
    // WheresMyGear reached the room first (via the top lane) -- neither
    // tile credits Limont, even though Limont was the sole completer of
    // the bottom tile.
    expect(result).toEqual({ top: 'wheresmygear', bottom: 'wheresmygear' });
  });

  it('treats a single-lane (boss) column the same as a plain tile', () => {
    const tiles = [{ id: 'boss', layout: { column: 5 } }];
    const result = computeAdventureFirstCompleters(
      [{ kind: 'tile', ref: 'boss', participant_id: 'a', completed_at: '2026-09-03T10:00:00Z' }],
      tiles,
    );
    expect(result).toEqual({ boss: 'a' });
  });

  it('scores each column independently', () => {
    const tiles = [
      { id: 'c0-top', layout: { column: 0 } },
      { id: 'c0-bottom', layout: { column: 0 } },
      { id: 'c1-top', layout: { column: 1 } },
      { id: 'c1-bottom', layout: { column: 1 } },
    ];
    const result = computeAdventureFirstCompleters(
      [
        { kind: 'tile', ref: 'c0-top', participant_id: 'a', completed_at: '2026-09-03T09:00:00Z' },
        { kind: 'tile', ref: 'c1-bottom', participant_id: 'b', completed_at: '2026-09-03T09:30:00Z' },
      ],
      tiles,
    );
    expect(result).toEqual({ 'c0-top': 'a', 'c0-bottom': 'a', 'c1-top': 'b', 'c1-bottom': 'b' });
  });

  it('ignores non-tile completions and tiles with no completions at all', () => {
    const tiles = [{ id: 't1', layout: { column: 0 } }];
    const result = computeAdventureFirstCompleters(
      [{ kind: 'board', ref: 'board', participant_id: 'a', completed_at: '2026-09-03T09:00:00Z' }],
      tiles,
    );
    expect(result).toEqual({});
  });
});
