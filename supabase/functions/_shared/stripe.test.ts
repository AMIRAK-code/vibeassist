import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeForm, grantPassFromSession, passOfferOpen, passPrice, pickSubscription, premiumPrice, subscriptionRow, syncCustomer, verifyStripeSignature } from './stripe.ts';

// Answers Stripe requests in order and records what was asked
function fakeStripe(responses: { status?: number; body: unknown }[]) {
  const calls: { method: string; path: string; body: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit) => {
    calls.push({ method: init.method ?? 'GET', path: url.pathname.replace('/v1/', ''), body: String(init.body ?? '') });
    const next = responses.shift() ?? { body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('premiumPrice', () => {
  const monthly = { id: 'price_current', unit_amount: 999, currency: 'usd', recurring: { interval: 'month' }, tax_behavior: 'exclusive' };

  it('reuses the price when Stripe already has the right amount', async () => {
    const calls = fakeStripe([{ body: { data: [monthly] } }]);
    expect(await premiumPrice('rk_test', 'monthly')).toBe('price_current');
    expect(calls).toHaveLength(1);
  });

  it('replaces an old amount: new price takes the lookup key, old one is archived', async () => {
    const old = { ...monthly, id: 'price_old', unit_amount: 1999 };
    const calls = fakeStripe([
      { body: { data: [old] } },
      { status: 400, body: { error: { code: 'resource_already_exists', message: 'Product already exists' } } },
      { body: { id: 'price_new' } },
      { body: { id: 'price_old', active: false } },
    ]);
    expect(await premiumPrice('rk_test', 'monthly')).toBe('price_new');
    const created = new URLSearchParams(calls[2].body);
    expect(calls[2].path).toBe('prices');
    expect(created.get('unit_amount')).toBe('999');
    expect(created.get('recurring[interval]')).toBe('month');
    expect(created.get('tax_behavior')).toBe('exclusive');
    expect(created.get('transfer_lookup_key')).toBe('true');
    expect(calls[3]).toMatchObject({ path: 'prices/price_old', body: 'active=false' });
  });

  it('creates the yearly price at half of twelve months on a fresh account', async () => {
    const calls = fakeStripe([{ body: { data: [] } }, { body: { id: 'vibeassist_premium' } }, { body: { id: 'price_year' } }]);
    expect(await premiumPrice('rk_test', 'yearly')).toBe('price_year');
    expect(new URLSearchParams(calls[2].body).get('unit_amount')).toBe('5988');
    expect(calls).toHaveLength(3); // nothing to archive
  });
});

const secret = 'whsec_test_secret';
const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });

async function sign(body: string, timestamp: number, key = secret) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${timestamp}.${body}`));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('verifyStripeSignature', () => {
  const now = 1_790_000_000;

  it('accepts a correctly signed, recent event', async () => {
    const header = `t=${now},v1=${await sign(payload, now)}`;
    expect(await verifyStripeSignature(payload, header, secret, { now })).toBe(true);
  });

  it('accepts any matching v1 signature while secrets are being rolled', async () => {
    const header = `t=${now},v1=${'0'.repeat(64)},v1=${await sign(payload, now)}`;
    expect(await verifyStripeSignature(payload, header, secret, { now })).toBe(true);
  });

  it('rejects a changed body, a different secret, an old event and a missing header', async () => {
    const header = `t=${now},v1=${await sign(payload, now)}`;
    expect(await verifyStripeSignature(payload.replace('updated', 'deleted'), header, secret, { now })).toBe(false);
    expect(await verifyStripeSignature(payload, header, 'whsec_other', { now })).toBe(false);
    expect(await verifyStripeSignature(payload, header, secret, { now: now + 301 })).toBe(false);
    expect(await verifyStripeSignature(payload, null, secret, { now })).toBe(false);
    expect(await verifyStripeSignature(payload, `t=${now}`, secret, { now })).toBe(false);
  });
});

describe('encodeForm', () => {
  it('flattens nested objects and arrays the way Stripe expects', () => {
    const form = encodeForm({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 1 }], metadata: { user_id: 'u1' }, skip: undefined });
    expect([...form.entries()]).toEqual([
      ['mode', 'subscription'],
      ['line_items[0][price]', 'price_1'],
      ['line_items[0][quantity]', '1'],
      ['metadata[user_id]', 'u1'],
    ]);
  });
});

describe('subscriptionRow', () => {
  const base = { id: 'sub_1', items: { data: [{ price: { recurring: { interval: 'month' } } }] } };

  it('turns an active subscription into Premium until the period ends', () => {
    expect(subscriptionRow({ ...base, status: 'active', current_period_end: 1_790_000_000 })).toEqual({
      plan: 'premium',
      billing_cycle: 'monthly',
      source: 'stripe',
      status: 'active',
      current_period_end: new Date(1_790_000_000 * 1000).toISOString(),
      cancel_at_period_end: false,
      stripe_subscription_id: 'sub_1',
    });
  });

  it('reads the period from the subscription item on newer API versions', () => {
    const row = subscriptionRow({ id: 'sub_2', status: 'trialing', items: { data: [{ current_period_end: 1_800_000_000, price: { recurring: { interval: 'year' } } }] } });
    expect(row.plan).toBe('premium');
    expect(row.billing_cycle).toBe('yearly');
    expect(row.current_period_end).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it('keeps Premium while a failed renewal is retried, and ends it once cancelled or unpaid', () => {
    expect(subscriptionRow({ ...base, status: 'past_due', current_period_end: 1 }).plan).toBe('premium');
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      const row = subscriptionRow({ ...base, status, current_period_end: 1 });
      expect(row.plan).toBe('free');
      expect(row.current_period_end).toBeNull();
    }
  });

  it('flags a subscription that is set to cancel', () => {
    expect(subscriptionRow({ ...base, status: 'active', cancel_at_period_end: true }).cancel_at_period_end).toBe(true);
    expect(subscriptionRow({ ...base, status: 'active', cancel_at: 1_790_000_000 }).cancel_at_period_end).toBe(true);
  });
});

describe('pickSubscription', () => {
  it('prefers a live subscription over a newer cancelled one', () => {
    const picked = pickSubscription([
      { id: 'old_active', status: 'active', created: 1 },
      { id: 'new_canceled', status: 'canceled', created: 2 },
    ]);
    expect(picked?.id).toBe('old_active');
  });

  it('falls back to the newest one, or nothing', () => {
    expect(pickSubscription([{ id: 'a', status: 'canceled', created: 1 }, { id: 'b', status: 'canceled', created: 5 }])?.id).toBe('b');
    expect(pickSubscription([])).toBeNull();
  });
});

// Records which rows each update would touch, like the Supabase query builder
function fakeAdmin(rpcResult: unknown = 'granted') {
  const updates: { table: string; values: Record<string, unknown>; filters: [string, unknown][] }[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const builder = (table: string, values?: Record<string, unknown>) => {
    const entry = { table, values: values ?? {}, filters: [] as [string, unknown][] };
    if (values) updates.push(entry);
    const chain: any = {
      eq: (col: string, v: unknown) => { entry.filters.push([`eq:${col}`, v]); return chain; },
      in: (col: string, v: unknown) => { entry.filters.push([`in:${col}`, v]); return chain; },
      neq: (col: string, v: unknown) => { entry.filters.push([`neq:${col}`, v]); return chain; },
      select: () => chain,
      maybeSingle: async () => ({ data: { plan: 'premium' }, error: null }),
      then: (resolve: (r: unknown) => void) => resolve({ error: null }),
    };
    return chain;
  };
  const admin = {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => builder(table, values),
      upsert: (values: Record<string, unknown>) => builder(table, values),
      select: () => builder(table),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return { data: rpcResult, error: null };
    },
  };
  return { admin, updates, rpcs };
}

describe('the $12.99 pass', () => {
  it('creates a one-time price without an interval and reuses it after', async () => {
    const calls = fakeStripe([{ body: { data: [] } }, { body: { id: 'vibeassist_premium' } }, { body: { id: 'price_pass' } }]);
    expect(await passPrice('rk_test')).toBe('price_pass');
    const created = new URLSearchParams(calls[2].body);
    expect(created.get('unit_amount')).toBe('1299');
    expect(created.has('recurring[interval]')).toBe(false);
    fakeStripe([{ body: { data: [{ id: 'price_pass', unit_amount: 1299, currency: 'usd', recurring: null, tax_behavior: 'exclusive' }] } }]);
    expect(await passPrice('rk_test')).toBe('price_pass');
  });

  it('lets a live subscription replace a pass, but an ended one never touches it', async () => {
    fakeStripe([{ body: { data: [{ id: 'sub_1', status: 'trialing', created: 1, items: { data: [{ price: { recurring: { interval: 'month' } } }] } }] } }]);
    const live = fakeAdmin();
    await syncCustomer('rk_test', live.admin, 'user-1', 'cus_1');
    expect(live.updates[0].filters).toContainEqual(['in:source', ['demo', 'stripe', 'pass']]);

    fakeStripe([{ body: { data: [{ id: 'sub_old', status: 'canceled', created: 1 }] } }]);
    const ended = fakeAdmin();
    await syncCustomer('rk_test', ended.admin, 'user-1', 'cus_1');
    expect(ended.updates[0].filters).toContainEqual(['in:source', ['demo', 'stripe']]);

    fakeStripe([{ body: { data: [] } }]);
    const none = fakeAdmin();
    await syncCustomer('rk_test', none.admin, 'user-1', 'cus_1');
    expect(none.updates[1].filters).toContainEqual(['eq:source', 'stripe']);
  });

  it('grants a paid checkout once and refunds an account that cannot have a pass', async () => {
    const session = { id: 'cs_test_1', payment_status: 'paid', client_reference_id: 'user-1', payment_intent: 'pi_1', amount_total: 1299, currency: 'usd' };
    const granted = fakeAdmin('granted');
    expect(await grantPassFromSession('rk_test', granted.admin, session)).toBe('granted');
    expect(granted.rpcs[0]).toEqual({ fn: 'grant_premium_pass', args: { p_session: 'cs_test_1', p_user: 'user-1', p_payment_intent: 'pi_1', p_amount: 1299, p_currency: 'usd', p_days: 60 } });

    const calls = fakeStripe([{ body: { id: 're_1' } }]);
    const ineligible = fakeAdmin('ineligible');
    expect(await grantPassFromSession('rk_test', ineligible.admin, session)).toBe('ineligible');
    expect(calls[0].path).toBe('refunds');
    expect(new URLSearchParams(calls[0].body).get('payment_intent')).toBe('pi_1');
    expect(ineligible.updates[0].values).toMatchObject({ status: 'refunded_ineligible' });

    expect(await grantPassFromSession('rk_test', fakeAdmin().admin, { ...session, payment_status: 'unpaid' })).toBe('unpaid');
  });

  it('can be closed with an end date', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    expect(passOfferOpen(null, now)).toBe(true);
    expect(passOfferOpen('2026-11-01', now)).toBe(true);
    expect(passOfferOpen('2026-10-01', now)).toBe(false);
  });
});
