import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
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

  it('an all-empty board still shows a visible grid -- empty cells must not match the gutter color', () => {
    const cells: CellStatus[] = Array.from({ length: 25 }, () => 'empty');
    const png = PNG.sync.read(renderBoardImage(cells));
    // Sample a pixel from the middle of the top-left cell's interior and
    // one from the gutter strip along the image's very top edge -- if
    // empty cells ever match the gutter color again, this pair collapses
    // to the same RGB and the row reads as a blank void, not a grid.
    const cellPixel = pixelAt(png, 40, 40);
    const gutterPixel = pixelAt(png, 40, 2);
    expect(cellPixel).not.toEqual(gutterPixel);
  });
});

function pixelAt(png: PNG, x: number, y: number): [number, number, number] {
  const idx = (png.width * y + x) << 2;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2]];
}
