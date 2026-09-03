import { describe, expect, it } from 'vitest';
import { countdownText, daysBetween, displayStatus, formatDateRange, formatLocalRange, preciseCountdownText } from './dungeonStatus';

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

describe('formatLocalRange', () => {
  it('shifts the UTC-anchored boundaries into an explicit timezone, including time of day', () => {
    // 2026-09-03T00:00:00Z is 2026-09-02, 8:00 PM in America/New_York
    // (EDT, UTC-4 in September) -- the exact WheresMyGear scenario this
    // was built for (BACKLOG.md #14).
    // Node's ICU renders a narrow no-break space (U+202F) before AM/PM.
    expect(formatLocalRange('2026-09-03', '2026-09-12', 'America/New_York')).toBe('Sep 2, 8:00 PM – Sep 12, 7:59 PM');
  });

  it('matches formatDateRange\'s day boundaries when the timezone is UTC itself', () => {
    expect(formatLocalRange('2026-09-03', '2026-09-12', 'UTC')).toBe('Sep 3, 12:00 AM – Sep 12, 11:59 PM');
  });
});

describe('preciseCountdownText', () => {
  const START = '2026-09-03';
  const END = '2026-09-12';

  it('counts down to end_date in days once more than a day remains', () => {
    const now = Date.parse('2026-09-10T12:00:00.000Z');
    expect(preciseCountdownText(START, END, now)).toBe('3 days remaining');
  });

  it('switches to hours once under a day remains', () => {
    const now = Date.parse('2026-09-12T14:00:00.000Z'); // ~10h before 23:59:59.999
    expect(preciseCountdownText(START, END, now)).toBe('10 hours remaining');
  });

  it('never reports 0 hours -- floors at 1 hour remaining right at the boundary', () => {
    const now = Date.parse('2026-09-12T23:59:59.998Z');
    expect(preciseCountdownText(START, END, now)).toBe('1 hour remaining');
  });

  it('counts down to start_date in days when more than a day away', () => {
    const now = Date.parse('2026-08-31T00:00:00.000Z');
    expect(preciseCountdownText(START, END, now)).toBe('Starts in 3 days');
  });

  it('switches to hours once under a day from starting', () => {
    const now = Date.parse('2026-09-02T18:00:00.000Z'); // 6h before start
    expect(preciseCountdownText(START, END, now)).toBe('Starts in 6 hours');
  });

  it('returns null once past end_date -- nothing left to count', () => {
    const now = Date.parse('2026-09-13T00:00:00.001Z');
    expect(preciseCountdownText(START, END, now)).toBeNull();
  });
});
