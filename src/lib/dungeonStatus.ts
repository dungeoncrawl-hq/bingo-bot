// Derives a My Dungeons row's display status and countdown text from dates
// alone -- kept out of DashboardPage.tsx so it's unit-testable without a
// DB or React around it (matches this codebase's usual split between pure
// lib logic and the page that renders it).
export interface DungeonDates {
  status: 'draft' | 'active' | 'ended';
  start_date: string; // "YYYY-MM-DD"
  end_date: string; // "YYYY-MM-DD"
}

// The DB's `status` just means "published" (active) or not (draft) --
// nothing in this codebase ever sets it to 'ended' (see BACKLOG.md), and a
// published challenge is active well before its own start_date arrives in
// the normal flow. So "upcoming" and "past" both have to come from
// start_date/end_date vs. today, not the stored status alone.
export type DisplayStatus = 'draft' | 'upcoming' | 'active' | 'past';

export function displayStatus(c: DungeonDates, today: string): DisplayStatus {
  if (c.status === 'draft') return 'draft';
  if (today < c.start_date) return 'upcoming';
  if (today > c.end_date) return 'past';
  return 'active';
}

export function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

// The countdown line under a row's date range -- what it counts down to
// (and from) depends entirely on the row's derived status. null for
// 'past' (nothing left to count).
export function countdownText(c: DungeonDates, status: DisplayStatus, today: string): string | null {
  if (status === 'active') {
    const days = daysBetween(today, c.end_date);
    return days === 0 ? 'Ends today' : `${days} day${plural(days)} remaining`;
  }
  if (status === 'upcoming') {
    const days = daysBetween(today, c.start_date);
    return `${days} day${plural(days)} until it begins`;
  }
  if (status === 'draft') {
    // Drafts have no scheduled publish date -- reusing start_date as an
    // urgency nudge instead ("this is when you told the board it'd
    // start, and it's still unpublished").
    const days = daysBetween(today, c.start_date);
    if (days < 0) return 'Start date has passed -- publish soon';
    return days === 0 ? 'Starts today -- publish soon' : `${days} day${plural(days)} to publish`;
  }
  return null;
}

// Formats a challenge's start/end range as observed in an explicit
// timezone, including time of day -- unlike formatDateRange (always UTC,
// date only), this is what surfaces "8:00 PM your time" so a viewer can
// tell at a glance what a UTC-anchored boundary means on their own clock
// (the confusion behind BACKLOG.md #14: a challenge's start_date/end_date
// are UTC calendar dates everywhere else in this codebase). `timeZone` is
// a parameter rather than implicit so this stays pure/testable -- callers
// pass Intl.DateTimeFormat().resolvedOptions().timeZone for "the viewer's
// own zone". End is end-of-day on end_date, mirroring
// participantStats.ts's boundaryMs 'end' convention.
export function formatLocalRange(start: string, end: string, timeZone: string): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).format(
      new Date(iso),
    );
  return `${fmt(`${start}T00:00:00.000Z`)} – ${fmt(`${end}T23:59:59.999Z`)}`;
}

// Days when there's at least one full day left, otherwise hours (down to
// a 1-hour floor so this never prints "0 hours") -- coarser than that is
// unhelpful when a challenge is about to start or end, which is exactly
// when this line matters most.
function formatDuration(ms: number): string {
  const totalHours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
  if (totalHours < 24) return `${totalHours} hour${plural(totalHours)}`;
  const days = Math.ceil(totalHours / 24);
  return `${days} day${plural(days)}`;
}

// Hour-precision counterpart to countdownText's day-only granularity --
// used on the board page itself (where "3 days remaining" isn't precise
// enough right at a boundary) rather than the compact dashboard list.
// Takes `nowMs` explicitly (not Date.now() internally) to stay pure/
// testable, same reasoning as every other "today" parameter in this file.
export function preciseCountdownText(start_date: string, end_date: string, nowMs: number): string | null {
  const startMs = Date.parse(`${start_date}T00:00:00.000Z`);
  const endMs = Date.parse(`${end_date}T23:59:59.999Z`);
  if (nowMs < startMs) return `Starts in ${formatDuration(startMs - nowMs)}`;
  if (nowMs <= endMs) return `${formatDuration(endMs - nowMs)} remaining`;
  return null;
}
