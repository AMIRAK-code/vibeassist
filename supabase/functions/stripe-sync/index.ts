// Connects the signed-in user's Stripe account with a read-only restricted key and
// imports daily revenue, fees and purchase counts into daily_metrics (source 'stripe').
//
// POST { action: 'connect', key: 'rk_…' } | { action: 'sync' } | { action: 'disconnect' }
// The key is stored encrypted in Supabase Vault and never returned to the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const SYNC_DAYS = 90;
const MAX_PAGES = 30; // up to 3,000 balance transactions per sync
const REVENUE_TYPES = new Set(['charge', 'payment']);
const REFUND_TYPES = new Set(['refund', 'payment_refund', 'payment_failure_refund']);
// Stripe amounts are in the smallest currency unit, except for these currencies
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// New-style keys come as a JSON dictionary; fall back to the legacy variables
function projectKey(newVar: string, legacyVar: string): string {
  try {
    const keys = JSON.parse(Deno.env.get(newVar) ?? '{}');
    if (keys.default) return keys.default;
  } catch {
    // fall through to the legacy key
  }
  return Deno.env.get(legacyVar) ?? '';
}

class StripeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function stripeGet(key: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(res.status, body?.error?.message ?? `Stripe returned ${res.status}`);
  return body;
}

// Turns Stripe's errors into something the user can act on
function explainStripeError(error: StripeError) {
  if (error.status === 401) return 'Stripe rejected this key. Check that you copied the whole key and that it has not been deleted.';
  if (error.status === 403) return 'This key is missing a permission. Give it read access to Balance in your Stripe dashboard.';
  if (error.status === 429) return 'Stripe is rate limiting requests. Try again in a minute.';
  return `Stripe error: ${error.message}`;
}

type Integration = { account_label: string | null };

async function syncStripe(
  admin: ReturnType<typeof createClient>,
  userId: string,
  key: string,
  integration: Integration | null,
) {
  const balance = await stripeGet(key, 'balance');
  const currency: string = balance?.available?.[0]?.currency ?? 'usd';
  const divisor = ZERO_DECIMAL.has(currency) ? 1 : 100;

  const startDay = new Date(Date.now() - (SYNC_DAYS - 1) * 864e5).toISOString().slice(0, 10);
  const since = Math.floor(new Date(`${startDay}T00:00:00Z`).getTime() / 1000);

  const days = new Map<string, { revenue: number; fees: number; purchases: number }>();
  let transactions = 0;
  let otherCurrency = 0;
  let startingAfter: string | undefined;
  let truncated = false;

  for (let page = 0; ; page++) {
    if (page === MAX_PAGES) {
      truncated = true;
      break;
    }
    const params: Record<string, string> = { limit: '100', 'created[gte]': String(since) };
    if (startingAfter) params.starting_after = startingAfter;
    const list = await stripeGet(key, 'balance_transactions', params);

    for (const tx of list.data ?? []) {
      if (!REVENUE_TYPES.has(tx.type) && !REFUND_TYPES.has(tx.type)) continue; // payouts, transfers, etc.
      if (tx.currency !== currency) {
        otherCurrency++;
        continue;
      }
      transactions++;
      const day = new Date(tx.created * 1000).toISOString().slice(0, 10);
      const totals = days.get(day) ?? { revenue: 0, fees: 0, purchases: 0 };
      totals.revenue += tx.amount / divisor; // refunds are negative amounts
      totals.fees += tx.fee / divisor;
      if (REVENUE_TYPES.has(tx.type)) totals.purchases++;
      days.set(day, totals);
    }

    if (!list.has_more || !list.data?.length) break;
    startingAfter = list.data[list.data.length - 1].id;
  }

  // Replace the whole window, so refunds and deleted test data are reflected
  const { error: deleteError } = await admin
    .from('daily_metrics')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'stripe')
    .gte('day', startDay);
  if (deleteError) throw deleteError;

  const rows = [...days.entries()].map(([day, t]) => ({
    user_id: userId,
    day,
    source: 'stripe',
    revenue: Math.round(t.revenue * 100) / 100,
    fees: Math.round(t.fees * 100) / 100,
    purchases: t.purchases,
  }));
  if (rows.length) {
    const { error: insertError } = await admin.from('daily_metrics').insert(rows);
    if (insertError) throw insertError;
  }

  const mode = key.startsWith('rk_live_') ? 'Live' : 'Test';
  const { error: integrationError } = await admin.from('integrations').upsert({
    user_id: userId,
    provider: 'stripe',
    status: 'connected',
    account_label: `${mode} mode · ${currency.toUpperCase()}`,
    last_error: null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(integration ? {} : { connected_at: new Date().toISOString() }),
  });
  if (integrationError) throw integrationError;

  // Show dashboard amounts in the Stripe account's currency
  const { error: profileError } = await admin.from('profiles').update({ currency: currency.toUpperCase() }).eq('id', userId);
  if (profileError) throw profileError;

  return { days: rows.length, transactions, currency: currency.toUpperCase(), otherCurrency, truncated };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(url, projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authError } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (authError || !user) return json({ error: 'Sign in first.' }, 401);

  // Bypasses RLS: only used for this user's rows, after the checks above
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  let body: { action?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }

  const { data: integration } = await admin
    .from('integrations')
    .select('account_label')
    .eq('user_id', user.id)
    .eq('provider', 'stripe')
    .eq('status', 'connected')
    .maybeSingle();

  if (body.action === 'disconnect') {
    const { error: keyError } = await admin.rpc('stripe_delete_key', { p_user: user.id });
    const { error: statusError } = await admin
      .from('integrations')
      .update({ status: 'disconnected', account_label: null, last_error: null, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('provider', 'stripe');
    if (keyError || statusError) {
      console.error('Failed to disconnect Stripe', keyError ?? statusError);
      return json({ error: 'Could not disconnect Stripe. Try again.' }, 500);
    }
    return json({ disconnected: true });
  }

  if (body.action !== 'connect' && body.action !== 'sync') return json({ error: 'Unknown action.' }, 400);

  const { data: subscription } = await db.from('subscriptions').select('plan, current_period_end').maybeSingle();
  const isPremium = subscription?.plan === 'premium' &&
    (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date());
  if (!isPremium) return json({ error: 'Integrations are a Premium feature.' }, 403);

  let key: string;
  if (body.action === 'connect') {
    key = (body.key ?? '').trim();
    if (!/^rk_(live|test)_[A-Za-z0-9]{10,}$/.test(key)) {
      return json({ error: 'Paste a Stripe restricted key (it starts with rk_live_ or rk_test_) with read access to Balance.' }, 400);
    }
  } else {
    const { data: storedKey, error: keyError } = await admin.rpc('stripe_get_key', { p_user: user.id });
    if (keyError) {
      console.error('Failed to read the Stripe key', keyError);
      return json({ error: 'Could not read your Stripe connection. Try again.' }, 500);
    }
    if (!storedKey) return json({ error: 'Stripe is not connected.' }, 400);
    key = storedKey;
  }

  try {
    if (body.action === 'connect') {
      await stripeGet(key, 'balance'); // proves the key works before it is stored
      const { error: storeError } = await admin.rpc('stripe_store_key', { p_user: user.id, p_key: key });
      if (storeError) throw storeError;
    }
    const result = await syncStripe(admin, user.id, key, integration);
    return json(result);
  } catch (error) {
    if (error instanceof StripeError) {
      const message = explainStripeError(error);
      // A stored key that stopped working is shown on the Integrations page
      if (body.action === 'sync') {
        await admin
          .from('integrations')
          .update({ status: 'error', last_error: message, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('provider', 'stripe');
      }
      return json({ error: message }, 400);
    }
    console.error('Stripe sync failed', error);
    return json({ error: 'Could not import from Stripe. Try again.' }, 500);
  }
});
