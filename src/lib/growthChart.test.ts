import { describe, expect, it } from 'vitest';
import { buildCumulativeSeries } from './growthChart';

describe('buildCumulativeSeries', () => {
  it('runs a cumulative total across days, oldest first', () => {
    const result = buildCumulativeSeries([
      { date: '2026-09-03', signups: 1, dungeonsCreated: 0 },
      { date: '2026-09-01', signups: 2, dungeonsCreated: 1 },
      { date: '2026-09-02', signups: 0, dungeonsCreated: 1 },
    ]);
    expect(result.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(result).toEqual([
      { date: '2026-09-01', cumSignups: 2, cumDungeons: 1 },
      { date: '2026-09-02', cumSignups: 2, cumDungeons: 2 },
      { date: '2026-09-03', cumSignups: 3, cumDungeons: 2 },
    ]);
  });

  it('returns an empty series for no days', () => {
    expect(buildCumulativeSeries([])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [
      { date: '2026-09-02', signups: 1, dungeonsCreated: 0 },
      { date: '2026-09-01', signups: 1, dungeonsCreated: 0 },
    ];
    const copy = [...input];
    buildCumulativeSeries(input);
    expect(input).toEqual(copy);
  });
});
