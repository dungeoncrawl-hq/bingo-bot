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

// BACKLOG.md #3 -- inverse of formatCompactNumber's display rounding: an
// exact (value, unit) pair for an editable K/M threshold control
// (TileEditorForm.tsx), not just a rounded-for-display string. Exact when
// the number is a clean multiple of 1,000,000 (M) or 1,000 (K); a value
// saved before this control existed, or hand-edited to an odd number,
// falls back to K with the value rounded -- a best-effort display only,
// re-quantized to a clean multiple the moment the host re-saves it via
// recomposeMoneyXp below.
export type MoneyXpUnit = 'K' | 'M';

export function decomposeMoneyXp(n: number): { value: number; unit: MoneyXpUnit } {
  if (n !== 0 && n % 1_000_000 === 0) return { value: n / 1_000_000, unit: 'M' };
  return { value: Math.max(1, Math.round(n / 1_000)), unit: 'K' };
}

export function recomposeMoneyXp(value: number, unit: MoneyXpUnit): number {
  return Math.max(0, Math.round(value)) * (unit === 'M' ? 1_000_000 : 1_000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "just now" / "5 minutes ago" / "3 hours ago" / "2 days ago" -- used for
// the "last Dink event" indicator (AccountPage.tsx, BoardPage.tsx).
// `nowMs` is a parameter rather than read internally (Date.now()) so this
// stays pure/testable, same reasoning as every other time-dependent
// helper this session (dungeonStatus.ts's preciseCountdownText). Caps out
// at days -- nothing here needs week/month/year granularity, and this is
// always about a recent event or a clearly-stale one, never a precise
// old date.
export function formatRelativeTime(iso: string, nowMs: number): string {
  const deltaMs = Math.max(0, nowMs - Date.parse(iso));
  const minutes = Math.floor(deltaMs / (1000 * 60));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
