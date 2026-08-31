// Compact "1.5M"/"12K" number formatting for XP and loot-value tiles, so
// large thresholds/progress don't take up more room than a tile can
// spare. Numbers under 10,000 stay as their exact comma-formatted value;
// at/above that, switches to K (10,000-999,999) or M (1,000,000+),
// keeping up to 3 significant decimal places with trailing zeros trimmed
// (1,500,000 -> "1.5M", 1,524,000 -> "1.524M", 12,000 -> "12K").
export function formatCompactNumber(n: number, options: { roundDown?: boolean } = {}): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 10_000) return n.toLocaleString();

  const [divisor, suffix] = abs >= 1_000_000 ? [1_000_000, 'M'] : [1_000, 'K'];
  const scaled = abs / divisor;
  // Round down (never up) for a live progress value, so a participant
  // never sees a number that reads as "already at the threshold" while
  // they're still short of it (e.g. 1,999,999 rounding to "2M").
  const rounded = options.roundDown ? Math.floor(scaled * 1000) / 1000 : scaled;
  const trimmed = rounded.toFixed(3).replace(/\.?0+$/, '');
  return `${sign}${trimmed}${suffix}`;
}
