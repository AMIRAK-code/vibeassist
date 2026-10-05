// Stripe helpers shared by the billing and stripe-webhook Edge Functions. Plain fetch and
// Web Crypto only, so the same file runs in Deno and in the Node unit tests.

export class StripeError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

// Stripe takes nested parameters as form fields: line_items[0][price]=…
export function encodeForm(params: Record<string, FormValue>, prefix = ''): URLSearchParams {
  const form = new URLSearchParams();
  const add = (key: string, value: FormValue) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => add(`${key}[${i}]`, v));
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
    else form.append(key, String(value));
  };
  for (const [key, value] of Object.entries(params)) add(prefix ? `${prefix}[${key}]` : key, value);
  return form;
}

export async function stripeRequest(
  key: string,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, FormValue> = {},
) {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  const form = encodeForm(params);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${key}` } };
  if (method === 'GET') form.forEach((value, name) => url.searchParams.append(name, value));
  else {
    init.body = form;
    (init.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(res.status, body?.error?.message ?? `Stripe returned ${res.status}`, body?.error?.code);
  return body;
}

const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Checks the Stripe-Signature header (t=…,v1=…) against the raw request body. Rejects
// anything older than the tolerance so a captured request can't be replayed later.
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  { toleranceSeconds = 300, now = Math.floor(Date.now() / 1000) } = {},
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(',').map((part) => part.split('='));
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(now - timestamp) > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = toHex(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${timestamp}.${payload}`)));
  // Compare every character so timing doesn't reveal how much of a guess matched
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    return diff === 0;
  });
}

// Statuses that keep Premium on. past_due means Stripe is still retrying a failed renewal.
const PREMIUM_STATUSES = new Set(['active', 'trialing', 'past_due']);

type StripeSubscription = {
  id: string;
  status: string;
  created?: number;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  current_period_end?: number;
  items?: { data?: { current_period_end?: number; price?: { recurring?: { interval?: string } } }[] };
};

// The subscription that decides the plan: a live one if there is one, otherwise the newest
export function pickSubscription(subscriptions: StripeSubscription[]): StripeSubscription | null {
  const newestFirst = [...subscriptions].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  return newestFirst.find((s) => PREMIUM_STATUSES.has(s.status)) ?? newestFirst[0] ?? null;
}

// Maps a Stripe subscription onto the subscriptions table. Newer Stripe API versions keep
// the billing period on the subscription item instead of the subscription.
export function subscriptionRow(subscription: StripeSubscription) {
  const item = subscription.items?.data?.[0];
  const premium = PREMIUM_STATUSES.has(subscription.status);
  const periodEnd = subscription.current_period_end ?? item?.current_period_end ?? null;
  return {
    plan: premium ? 'premium' : 'free',
    billing_cycle: premium ? (item?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly') : null,
    source: 'stripe',
    status: subscription.status,
    current_period_end: premium && periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
    stripe_subscription_id: subscription.id,
  };
}

// Minimal shape of the Supabase admin client, so this file needs no npm imports
type AdminClient = {
  from: (table: string) => any;
};

// Pulls the customer's subscriptions from Stripe and stores the one that matters on the
// user's plan. Stripe stays the source of truth, so running this twice, or for events that
// arrive out of order, always ends in the same state.
export async function syncCustomer(key: string, admin: AdminClient, userId: string, customerId: string) {
  const list = await stripeRequest(key, 'GET', 'subscriptions', { customer: customerId, status: 'all', limit: 20 });
  const subscription = pickSubscription(list.data ?? []);
  const now = new Date().toISOString();

  if (subscription) {
    // Admin Premium is set by hand, so old Stripe subscriptions on the customer don't touch it
    const { error } = await admin
      .from('subscriptions')
      .update({ ...subscriptionRow(subscription), stripe_customer_id: customerId, updated_at: now })
      .eq('user_id', userId)
      .neq('source', 'admin');
    if (error) throw error;
  } else {
    // No subscription (checkout not finished yet): remember the customer, and only reset a
    // plan that came from Stripe, never a demo plan
    const { error: customerError } = await admin.from('subscriptions').update({ stripe_customer_id: customerId }).eq('user_id', userId);
    if (customerError) throw customerError;
    const { error } = await admin
      .from('subscriptions')
      .update({ plan: 'free', billing_cycle: null, status: null, current_period_end: null, cancel_at_period_end: false, stripe_subscription_id: null, updated_at: now })
      .eq('user_id', userId)
      .eq('source', 'stripe');
    if (error) throw error;
  }

  const { data, error } = await admin.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

// Premium's prices, found by lookup key and created on the first checkout if the Stripe
// account doesn't have them yet. These amounts are the source of truth and must match the
// plans page: change them here and the next checkout creates the new price, moves the
// lookup key to it and archives the old one (people already subscribed keep their price).
// VAT is added on top by Stripe Tax ("exclusive"), as the plans page says.
export const PREMIUM_PRODUCT_ID = 'vibeassist_premium';
export const PREMIUM_PRICES = {
  monthly: { lookup_key: 'vibeassist_premium_monthly', unit_amount: 999, interval: 'month' }, // $9.99
  yearly: { lookup_key: 'vibeassist_premium_yearly', unit_amount: 5988, interval: 'year' }, // $59.88, half of 12 × $9.99
} as const;

export async function premiumPrice(key: string, cycle: keyof typeof PREMIUM_PRICES): Promise<string> {
  const spec = PREMIUM_PRICES[cycle];
  const found = await stripeRequest(key, 'GET', 'prices', { lookup_keys: [spec.lookup_key], active: true, limit: 1 });
  const existing = found.data?.[0];
  const current = existing?.id &&
    existing.unit_amount === spec.unit_amount &&
    existing.currency === 'usd' &&
    existing.recurring?.interval === spec.interval;
  if (current) {
    // A price made before tax was switched on: tell Stripe Tax that VAT goes on top
    if (existing.tax_behavior === 'unspecified') {
      await stripeRequest(key, 'POST', `prices/${existing.id}`, { tax_behavior: 'exclusive' });
    }
    return existing.id;
  }

  try {
    await stripeRequest(key, 'POST', 'products', {
      id: PREMIUM_PRODUCT_ID,
      name: 'VibeAssist Premium',
      description: 'Weekly plans from your numbers, Stripe and Custom API imports, and campaign tracking.',
    });
  } catch (error) {
    if (!(error instanceof StripeError && error.code === 'resource_already_exists')) throw error;
  }
  const price = await stripeRequest(key, 'POST', 'prices', {
    product: PREMIUM_PRODUCT_ID,
    currency: 'usd',
    unit_amount: spec.unit_amount,
    recurring: { interval: spec.interval },
    tax_behavior: 'exclusive',
    lookup_key: spec.lookup_key,
    transfer_lookup_key: true,
  });
  // The old amount stops being offered; subscriptions already on it carry on unchanged
  if (existing?.id) await stripeRequest(key, 'POST', `prices/${existing.id}`, { active: false });
  return price.id;
}
