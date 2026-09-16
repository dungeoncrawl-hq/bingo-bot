// Pure data transform for AdminGrowthPage.tsx's cumulative signups/
// dungeons-created line chart -- kept out of the page itself so it's
// unit-testable without a DB or React around it, same split this
// codebase already uses for dungeonStatus.ts/leaderboard.ts. The SVG
// coordinate math stays in the page (presentation, not data).
export interface DayActivity {
  date: string; // "YYYY-MM-DD"
  signups: number;
  dungeonsCreated: number;
}

export interface CumulativePoint {
  date: string;
  cumSignups: number;
  cumDungeons: number;
}

// Input may be in any order (the page's own daily table sorts
// newest-first) -- this always returns oldest-first, since a running
// total only makes sense read left-to-right.
export function buildCumulativeSeries(days: DayActivity[]): CumulativePoint[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let cumSignups = 0;
  let cumDungeons = 0;
  return sorted.map((d) => {
    cumSignups += d.signups;
    cumDungeons += d.dungeonsCreated;
    return { date: d.date, cumSignups, cumDungeons };
  });
}
