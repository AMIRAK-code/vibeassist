import { describe, expect, it, vi } from 'vitest';
import { describeSync, readKeyFile, syncAllConnected } from './integrations';

describe('syncAllConnected', () => {
  it('syncs every connected source once and reports each one, even when one fails', async () => {
    const call = vi.fn(async (fn, body) => {
      if (body.provider === 'google_play') return { status: 400, data: { error: 'Permissions not given yet' } };
      if (fn === 'stripe-sync') return { status: 200, data: { transactions: 3, days: 2 } };
      return { status: 200, data: { days: 90, downloads: 1200, purchases: 1, partial: false } };
    });
    const outcomes = await syncAllConnected([
      { provider: 'stripe', status: 'connected' },
      { provider: 'app_store', status: 'connected' },
      { provider: 'google_play', status: 'connected' },
      { provider: 'custom_api', status: 'connected' },
      { provider: 'stripe', status: 'disconnected' },
    ], call);
    expect(call).toHaveBeenCalledTimes(3);
    expect(call).toHaveBeenCalledWith('store-sync', { provider: 'app_store', action: 'sync' });
    expect(outcomes).toEqual([
      { provider: 'stripe', ok: true, text: 'Stripe: 3 transactions across 2 days' },
      { provider: 'app_store', ok: true, text: 'App Store: 90 days checked, 1,200 downloads, 1 purchase' },
      { provider: 'google_play', ok: false, text: 'Google Play: Permissions not given yet' },
    ]);
  });

  it('treats a network failure or a partial import as not fully OK', async () => {
    const call = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 200, data: { days: 1, downloads: 0, purchases: 0, partial: true, skippedCurrencies: ['EGP'] } });
    const outcomes = await syncAllConnected([{ provider: 'stripe', status: 'connected' }, { provider: 'app_store', status: 'connected' }], call);
    expect(outcomes[0]).toEqual({ provider: 'stripe', ok: false, text: 'Stripe: sync failed' });
    expect(outcomes[1].ok).toBe(false);
    expect(outcomes[1].text).toMatch(/Not converted: EGP\. Some days could not be read/);
  });
});

describe('describeSync and readKeyFile', () => {
  it('writes singular and plural correctly', () => {
    expect(describeSync('stripe', { transactions: 1, days: 1 })).toBe('1 transaction across 1 day');
  });

  it('refuses files too big to be a key', async () => {
    await expect(readKeyFile({ size: 100_000, text: async () => '' })).rejects.toThrow(/too big/);
    expect(await readKeyFile({ size: 10, text: async () => 'key' })).toBe('key');
  });
});
