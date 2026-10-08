import { describe, expect, it } from 'vitest';
import { priceSignal, unitEconomics } from './unitEconomics';

const day = (n, values = {}) => ({
  day: `2026-09-${String(n).padStart(2, '0')}`,
  revenue: 0, fees: 0, adSpend: 0, organicDownloads: 0, paidDownloads: 0, downloads: 0, purchases: 0, activeUsers: null,
  ...values,
});

describe('unitEconomics', () => {
  it('works out CAC, monthly ARPU, payback and LTV from 30 days of numbers', () => {
    const days = Array.from({ length: 30 }, (_, i) => day(i + 1, {
      revenue: 100, fees: 10, adSpend: 20, paidDownloads: 10, downloads: 25, activeUsers: 300,
    }));
    const result = unitEconomics(days, 30, 5);
    expect(result.cac).toBeCloseTo(2); // 600 spend / 300 paid installs
    expect(result.arpuMonthly).toBeCloseTo(9); // (3000 - 300) / 300 users
    expect(result.revenuePerDownload).toBeCloseTo(4);
    expect(result.paybackMonths).toBeCloseTo(2 / 9);
    expect(result.ltv).toBeCloseTo(180); // 9 / 0.05
    expect(result.ltvToCac).toBeCloseTo(90);
    expect(result.missing).toEqual([]);
  });

  it('scales ARPU to a 30-day month and ignores days without active users', () => {
    const days = [
      day(1, { revenue: 70, activeUsers: 10 }),
      day(2, { revenue: 70 }), // no active users reported
      ...Array.from({ length: 5 }, (_, i) => day(i + 3, { activeUsers: 10 })),
    ];
    expect(unitEconomics(days, 7).arpuMonthly).toBeCloseTo((140 / 10) * (30 / 7));
  });

  it('says what is missing instead of inventing numbers', () => {
    const result = unitEconomics([day(1, { revenue: 50, downloads: 5 })], 1);
    expect(result).toMatchObject({ cac: null, arpuMonthly: null, paybackMonths: null, ltv: null, ltvToCac: null });
    expect(result.missing).toEqual(['ad spend', 'active users', 'your monthly churn estimate']);
    expect(unitEconomics([day(1, { adSpend: 5 })], 1).missing[0]).toBe('downloads from ads');
    expect(unitEconomics([day(1)], 1, 0).missing).toContain('your monthly churn estimate');
  });
});

describe('priceSignal', () => {
  const weeks = (prices) => prices.flatMap(([price, purchases], w) =>
    Array.from({ length: 7 }, (_, i) => day(w * 7 + i + 1, { purchases, revenue: price * purchases })));

  it('finds a price move between two weeks and estimates elasticity', () => {
    const { weeks: found, change } = priceSignal(weeks([[5, 10], [5, 10], [6, 8]]));
    expect(found).toHaveLength(3);
    expect(found[0].price).toBeCloseTo(5);
    expect(change.before.price).toBeCloseTo(5);
    expect(change.after.price).toBeCloseTo(6);
    // purchases -22.2% (arc) against price +18.2% (arc)
    expect(change.elasticity).toBeCloseTo((-2 / 9) / (1 / 5.5));
  });

  it('reports no change when price stays within the threshold or purchases are missing', () => {
    expect(priceSignal(weeks([[5, 10], [5.2, 12]])).change).toBeNull();
    expect(priceSignal(weeks([[5, 0], [9, 10]])).change).toBeNull();
    expect(priceSignal([day(1)]).weeks).toEqual([]);
  });
});
