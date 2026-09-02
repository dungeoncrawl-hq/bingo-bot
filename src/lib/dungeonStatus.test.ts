import { describe, expect, it } from 'vitest';
import { countdownText, daysBetween, displayStatus, formatDateRange } from './dungeonStatus';

const TODAY = '2026-09-05';

describe('displayStatus', () => {
  it('is draft whenever the stored status is draft, regardless of dates', () => {
    expect(displayStatus({ status: 'draft', start_date: '2026-09-01', end_date: '2026-09-03' }, TODAY)).toBe('draft');
    expect(displayStatus({ status: 'draft', start_date: '2026-09-10', end_date: '2026-09-20' }, TODAY)).toBe('draft');
  });

  it('is upcoming once published but before start_date', () => {
    expect(displayStatus({ status: 'active', start_date: '2026-09-06', end_date: '2026-09-20' }, TODAY)).toBe('upcoming');
  });

  it('is active on and between start_date/end_date, inclusive', () => {
    expect(displayStatus({ status: 'active', start_date: '2026-09-05', end_date: '2026-09-05' }, TODAY)).toBe('active');
    expect(displayStatus({ status: 'active', start_date: '2026-09-01', end_date: '2026-09-13' }, TODAY)).toBe('active');
  });

  it('is past once today is after end_date, even if status is still active', () => {
    expect(displayStatus({ status: 'active', start_date: '2026-08-01', end_date: '2026-09-04' }, TODAY)).toBe('past');
  });
});

describe('daysBetween', () => {
  it('counts whole days between two dates', () => {
    expect(daysBetween('2026-09-01', '2026-09-13')).toBe(12);
    expect(daysBetween('2026-09-05', '2026-09-05')).toBe(0);
  });

  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-09-05', '2026-09-01')).toBe(-4);
  });
});

describe('countdownText', () => {
  it('counts down to end_date when active', () => {
    expect(countdownText({ status: 'active', start_date: '2026-09-01', end_date: '2026-09-13' }, 'active', TODAY)).toBe(
      '8 days remaining',
    );
    expect(countdownText({ status: 'active', start_date: '2026-09-01', end_date: TODAY }, 'active', TODAY)).toBe('Ends today');
  });

  it('counts down to start_date when upcoming', () => {
    expect(countdownText({ status: 'active', start_date: '2026-09-06', end_date: '2026-09-20' }, 'upcoming', TODAY)).toBe(
      '1 day until it begins',
    );
  });

  it('nudges toward the start date when draft, singular for 1 day', () => {
    expect(countdownText({ status: 'draft', start_date: '2026-09-06', end_date: '2026-09-20' }, 'draft', TODAY)).toBe(
      '1 day to publish',
    );
  });

  it('flags an already-passed start date for a still-unpublished draft', () => {
    expect(countdownText({ status: 'draft', start_date: '2026-09-01', end_date: '2026-09-20' }, 'draft', TODAY)).toBe(
      'Start date has passed -- publish soon',
    );
  });

  it('returns null for past (nothing left to count)', () => {
    expect(countdownText({ status: 'active', start_date: '2026-08-01', end_date: '2026-09-01' }, 'past', TODAY)).toBeNull();
  });
});

describe('formatDateRange', () => {
  it('formats as "Mon D – Mon D"', () => {
    expect(formatDateRange('2026-09-01', '2026-09-13')).toBe('Sep 1 – Sep 13');
  });
});
