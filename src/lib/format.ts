// Compact "1.5M"/"12K" number formatting for XP and loot-value tiles, so
// large thresholds/progress don't take up more room than a tile can
// spare. Numbers under 10,000 stay as their exact comma-formatted value.
// K (10,000-999,999) always shows a whole number, no decimals
// (123,444 -> "123K") -- three-ish digits already reads precisely enough
// at that scale. M (1,000,000+) keeps up to 2 decimal places, trailing
// zeros trimmed (1,500,000 -> "1.5M", 1,250,000 -> "1.25M").
export function formatCompactNumber(n: number, options: { roundDown?: boolean } = {}): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 10_000) return n.toLocaleString();

  if (abs < 1_000_000) {
    const scaled = abs / 1_000;
    const whole = options.roundDown ? Math.floor(scaled) : Math.round(scaled);
    return `${sign}${whole}K`;
  }

  const scaled = abs / 1_000_000;
  // Round down (never up) for a live progress value, so a participant
  // never sees a number that reads as "already at the threshold" while
  // they're still short of it (e.g. 1,999,999 rounding to "2M").
  const rounded = options.roundDown ? Math.floor(scaled * 100) / 100 : scaled;
  const trimmed = rounded.toFixed(2).replace(/\.?0+$/, '');
  return `${sign}${trimmed}M`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
