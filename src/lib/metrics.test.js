import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, buildSampleRows, daysSince, formatDay, isoDay, relativeDay, summarize } from './metrics';

const row = (day, source, values = {}) => ({
  day, source, revenue: 0, fees: 0, ad_spend: 0, organic_downloads: 0, paid_downloads: 0, purchases: 0, active_users: null, ...values,
});

describe('summarize', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12)); // 2 Oct 2026, local time
  });
  afterEach(() => vi.useRealTimers());

  it('adds every source together per day and splits the two periods', () => {
    const rows = [
      row('2026-10-02', 'stripe', { revenue: 100, fees: 3 }),
      row('2026-10-02', 'manual', { ad_spend: 20, organic_downloads: 10, paid_downloads: 5, purchases: 2 }),
      row('2026-09-26', 'manual', { revenue: 50 }), // 7th day of a 7-day period
      row('2026-09-25', 'manual', { revenue: 999 }), // first day of the previous 7 days
      row('2026-09-18', 'manual', { revenue: 1 }), // outside both periods
    ];
    const { current, previous, chartData } = summarize(rows, 7);
    expect(current).toMatchObject({ revenue: 150, fees: 3, adSpend: 20, downloads: 15, purchases: 2, daysWithData: 2 });
    expect(previous).toMatchObject({ revenue: 999, daysWithData: 1 });
    expect(chartData).toHaveLength(7);
    expect(chartData[0].day).toBe('2026-09-26');
    expect(chartData.at(-1)).toMatchObject({ day: '2026-10-02', revenue: 100, profit: 100 - 3 - 20, downloads: 15, hasData: true });
    expect(chartData[1].hasData).toBe(false);
  });

  it('reports the most recent active users and the sources present', () => {
    const rows = [
      row('2026-09-30', 'custom_api', { active_users: 400 }),
      row('2026-10-01', 'manual', { active_users: 420 }),
      row('2026-10-01', 'custom_api', { active_users: 30 }),
    ];
    const { latestActiveUsers, sources } = summarize(rows, 30);
    expect(latestActiveUsers).toBe(450);
    expect(sources.sort()).toEqual(['custom_api', 'manual']);
  });
});

describe('dates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 0, 30)); // just after midnight: local day must not slip
  });
  afterEach(() => vi.useRealTimers());

  it('formats and compares calendar days in local time', () => {
    expect(isoDay(new Date())).toBe('2026-10-02');
    expect(isoDay(addDays(new Date(), -2))).toBe('2026-09-30');
    expect(formatDay('2026-09-30')).toBe('Sep 30');
    expect(formatDay('2026-09-30', true)).toBe('Sep 30, 2026');
    expect(daysSince('2026-10-02')).toBe(0);
    expect(relativeDay('2026-10-01')).toBe('yesterday');
    expect(relativeDay('2026-09-28')).toBe('4 days ago');
  });
});

describe('buildSampleRows', () => {
  it('only ever produces rows marked as sample data', () => {
    const rows = buildSampleRows('user-1');
    expect(rows).toHaveLength(60);
    expect(new Set(rows.map((r) => r.source))).toEqual(new Set(['sample']));
    expect(new Set(rows.map((r) => r.day)).size).toBe(60);
    expect(rows.every((r) => r.revenue >= 0 && r.purchases >= 0)).toBe(true);
  });
});
