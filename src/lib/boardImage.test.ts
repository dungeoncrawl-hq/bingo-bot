import { describe, expect, it } from 'vitest';
import { colorForCell, renderBoardImage, type CellStatus } from './boardImage';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('colorForCell', () => {
  it('gives each status its own distinct color', () => {
    const statuses: CellStatus[] = ['done', 'first', 'notDone', 'empty'];
    const colors = statuses.map(colorForCell);
    const unique = new Set(colors.map((c) => `${c.r},${c.g},${c.b}`));
    expect(unique.size).toBe(4);
  });

  it('done is green-ish (green channel dominant)', () => {
    const c = colorForCell('done');
    expect(c.g).toBeGreaterThan(c.r);
    expect(c.g).toBeGreaterThan(c.b);
  });

  it('first is amber/gold-ish (red and green both high, blue low)', () => {
    const c = colorForCell('first');
    expect(c.r).toBeGreaterThan(c.b);
    expect(c.g).toBeGreaterThan(c.b);
  });
});

describe('renderBoardImage', () => {
  it('produces a non-empty buffer starting with the PNG signature', () => {
    const cells: CellStatus[] = Array.from({ length: 25 }, (_, i) => (i % 2 === 0 ? 'done' : 'notDone'));
    const buffer = renderBoardImage(cells);
    expect(buffer.length).toBeGreaterThan(0);
    expect([...buffer.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  });

  it('defaults missing cells to empty rather than throwing', () => {
    const buffer = renderBoardImage([]);
    expect(buffer.length).toBeGreaterThan(0);
    expect([...buffer.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  });
});
