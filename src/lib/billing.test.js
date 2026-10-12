import { describe, expect, it } from 'vitest';
import { isActivePremium, planSummary } from './billing';

const now = new Date('2026-10-01T12:00:00Z');
const later = '2026-11-01T12:00:00Z';
const earlier = '2026-09-01T12:00:00Z';

describe('isActivePremium', () => {
  it('needs a Premium plan whose period has not ended', () => {
    expect(isActivePremium({ plan: 'premium', current_period_end: later }, now)).toBe(true);
    expect(isActivePremium({ plan: 'premium', current_period_end: earlier }, now)).toBe(false);
    expect(isActivePremium({ plan: 'free', current_period_end: later }, now)).toBe(false);
    expect(isActivePremium(null, now)).toBe(false);
  });
});

describe('planSummary', () => {
  const stripe = { plan: 'premium', source: 'stripe', billing_cycle: 'monthly', status: 'active', current_period_end: later };

  it('describes an active subscription by when it renews', () => {
    expect(planSummary(stripe, now)).toEqual({ label: 'Premium, monthly', detail: 'Renews on Nov 1, 2026.' });
  });

  it('says when a cancelled subscription ends', () => {
    expect(planSummary({ ...stripe, cancel_at_period_end: true }, now).detail).toBe("Cancelled. Premium stays on until Nov 1, 2026, then you're on Free.");
  });

  it('warns about a failed payment', () => {
    const summary = planSummary({ ...stripe, status: 'past_due' }, now);
    expect(summary.warning).toBe(true);
    expect(summary.detail).toMatch(/Update your card/);
  });

  it('labels leftover demo plans and expired plans honestly', () => {
    expect(planSummary({ ...stripe, source: 'demo', status: null }, now).label).toBe('Premium (demo, monthly)');
    expect(planSummary({ ...stripe, current_period_end: earlier }, now).label).toBe('Free');
  });

  it('labels admin Premium, which has no end date', () => {
    const admin = { plan: 'premium', source: 'admin', billing_cycle: null, status: null, current_period_end: null };
    expect(isActivePremium(admin, now)).toBe(true);
    expect(planSummary(admin, now).label).toBe('Premium (admin)');
  });
});

describe('the 60-day pass', () => {
  it('says it was paid once, when it ends and that it does not renew', () => {
    const pass = { plan: 'premium', source: 'pass', billing_cycle: null, status: 'paid', current_period_end: later, cancel_at_period_end: true };
    expect(planSummary(pass, now)).toEqual({
      label: 'Premium, 60-day pass',
      detail: "Paid once. Premium until Nov 1, 2026; it doesn't renew. Subscribe any time and the first charge waits until the pass ends.",
    });
    expect(planSummary({ ...pass, current_period_end: earlier }, now).label).toBe('Free');
  });

  it('describes a subscription waiting for its first payment', () => {
    const trial = { plan: 'premium', source: 'stripe', billing_cycle: 'monthly', status: 'trialing', current_period_end: later };
    expect(planSummary(trial, now).detail).toBe('First payment on Nov 1, 2026.');
  });
});
