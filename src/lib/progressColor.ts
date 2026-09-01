// Interpolates a single solid color for "how far along is this" (0-100),
// red -> yellow -> green, used for both the tile progress bar and the
// closest-participant badge on unclaimed tiles -- one color scale so both
// read the same way at a glance.
const RED: [number, number, number] = [0xef, 0x44, 0x44];
const YELLOW: [number, number, number] = [0xea, 0xb3, 0x08];
const GREEN: [number, number, number] = [0x22, 0xc5, 0x5e];

function mix(from: [number, number, number], to: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function progressColor(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const rgb = clamped <= 50 ? mix(RED, YELLOW, clamped / 50) : mix(YELLOW, GREEN, (clamped - 50) / 50);
  return toHex(rgb);
}
