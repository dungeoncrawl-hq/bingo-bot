// Renders a participant's 5x5 board as a PNG for Discord completion embeds
// (see src/server/discordEmbeds.ts, api/board-image/[participantId].ts).
// Colored squares only -- no tile icons/labels composited in, to avoid
// fetching/decoding/resizing external wiki images server-side. Uses pngjs
// (pure JS, no native binaries) so this runs anywhere Vercel's Node
// runtime does, unlike canvas/sharp/resvg-style libraries.
import { PNG } from 'pngjs';

export type CellStatus = 'done' | 'first' | 'notDone' | 'empty';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const DONE_COLOR: Rgb = { r: 0x22, g: 0xc5, b: 0x5e }; // green-500
const FIRST_COLOR: Rgb = { r: 0xfb, g: 0xbf, b: 0x24 }; // amber-400, matches the board's star badge
const NOT_DONE_COLOR: Rgb = { r: 0x1c, g: 0x19, b: 0x17 }; // stone-900
const EMPTY_COLOR: Rgb = { r: 0x0c, g: 0x0a, b: 0x09 }; // stone-950
const GUTTER_COLOR: Rgb = { r: 0x0c, g: 0x0a, b: 0x09 }; // stone-950

export function colorForCell(status: CellStatus): Rgb {
  switch (status) {
    case 'done':
      return DONE_COLOR;
    case 'first':
      return FIRST_COLOR;
    case 'notDone':
      return NOT_DONE_COLOR;
    case 'empty':
      return EMPTY_COLOR;
  }
}

const GRID_SIZE = 5;
const CELL_SIZE = 84;
const GUTTER = 8;
const CANVAS_SIZE = CELL_SIZE * GRID_SIZE + GUTTER * (GRID_SIZE + 1);

function setPixel(png: PNG, x: number, y: number, color: Rgb): void {
  const idx = (CANVAS_SIZE * y + x) << 2;
  png.data[idx] = color.r;
  png.data[idx + 1] = color.g;
  png.data[idx + 2] = color.b;
  png.data[idx + 3] = 255;
}

// cells is row-major (index = row * 5 + col), matching gridLines'
// indexing convention in tileConditions.ts -- must have exactly 25 entries.
export function renderBoardImage(cells: CellStatus[]): Buffer {
  const png = new PNG({ width: CANVAS_SIZE, height: CANVAS_SIZE });

  for (let y = 0; y < CANVAS_SIZE; y++) {
    for (let x = 0; x < CANVAS_SIZE; x++) {
      setPixel(png, x, y, GUTTER_COLOR);
    }
  }

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const color = colorForCell(cells[row * GRID_SIZE + col] ?? 'empty');
      const originX = GUTTER + col * (CELL_SIZE + GUTTER);
      const originY = GUTTER + row * (CELL_SIZE + GUTTER);
      for (let y = originY; y < originY + CELL_SIZE; y++) {
        for (let x = originX; x < originX + CELL_SIZE; x++) {
          setPixel(png, x, y, color);
        }
      }
    }
  }

  return PNG.sync.write(png);
}
