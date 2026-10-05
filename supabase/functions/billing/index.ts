// Premium billing through Stripe, for the signed-in user.
//
// POST { action: 'config' }                     -> { configured, livemode }
// POST { action: 'checkout', cycle, from? }     -> { url } of a Stripe Checkout page
// POST { action: 'portal' }                     -> { url } of the Stripe billing portal
// POST { action: 'sync', session_id? }          -> { subscription, checkout? } pulled fresh from Stripe
//
// Secrets: STRIPE_SECRET_KEY (required), SITE_URL (the deployed app's address).
// The stripe-webhook function keeps plans in step with renewals and cancellations.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { premiumPrice, StripeError, stripeRequest, syncCustomer } from '../_shared/stripe.ts';

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

// Where Stripe sends people back to: the page's own origin when it's a known address,
// otherwise the live site
function appOrigin(req: Request): string {
  const known = [Deno.env.get('SITE_URL'), 'https://vibeassist.assist365.app', 'http://localhost:5173', 'http://127.0.0.1:5173']
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value).origin);
  const origin = req.headers.get('origin');
  return origin && known.includes(origin) ? origin : known[0];
}

const safePath = (path: unknown) =>
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard';

function explainStripeError(error: StripeError): string {
  if (error.status === 401) return 'Payments are misconfigured: Stripe rejected the secret key. Nothing was charged.';
  if (/stripe tax|tax settings|head office/i.test(error.message)) {
    return "Taxes aren't set up in Stripe yet: open Tax in the Stripe dashboard, add the business address and turn it on. Nothing was charged.";
  }
  if (/customer portal|default configuration/i.test(error.message)) {
    return "Billing management isn't set up yet: save the customer portal settings once in the Stripe dashboard.";
  }
  if (error.status === 429) return 'Stripe is busy. Try again in a minute; nothing was charged.';
  return `Stripe couldn't complete that: ${error.message}`;
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

  let body: { action?: string; cycle?: string; from?: string; session_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }

  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (body.action === 'config') {
    return json({ configured: Boolean(key), livemode: /^(sk|rk)_live_/.test(key) });
  }
  if (!key) return json({ error: 'not_configured' }, 503);

  // Bypasses RLS: only touches this user's own subscription row
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const { data: current, error: readError } = await admin.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle();
  if (readError || !current) {
    console.error('Failed to read the subscription', readError);
    return json({ error: 'Could not load your plan. Try again.' }, 500);
  }

  // The Stripe customer for this user, created on first checkout. A stored customer that
  // no longer exists (deleted, or from test mode after going live) is replaced.
  const ensureCustomer = async (): Promise<string> => {
    if (current.stripe_customer_id) {
      try {
        const existing = await stripeRequest(key, 'GET', `customers/${current.stripe_customer_id}`);
        if (!existing.deleted) return existing.id;
      } catch (error) {
        if (!(error instanceof StripeError && error.code === 'resource_missing')) throw error;
      }
    }
    const customer = await stripeRequest(key, 'POST', 'customers', { email: user.email, metadata: { user_id: user.id } });
    const { error } = await admin.from('subscriptions').update({ stripe_customer_id: customer.id }).eq('user_id', user.id);
    if (error) throw error;
    return customer.id;
  };

  try {
    if (body.action === 'checkout') {
      if (current.plan === 'premium' && (current.source === 'stripe' || current.source === 'admin')) {
        return json({ error: 'already_subscribed' }, 409);
      }
      const cycle = body.cycle === 'yearly' ? 'yearly' : 'monthly';
      const origin = appOrigin(req);
      const [customer, price] = await Promise.all([ensureCustomer(), premiumPrice(key, cycle)]);
      const session = await stripeRequest(key, 'POST', 'checkout/sessions', {
        mode: 'subscription',
        customer,
        client_reference_id: user.id,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        // Stripe Tax adds VAT for the customer's country from their billing address;
        // businesses can enter a VAT ID (reverse charge). Both are saved on the customer.
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true },
        customer_update: { address: 'auto', name: 'auto' },
        metadata: { user_id: user.id },
        subscription_data: { metadata: { user_id: user.id } },
        success_url: `${origin}/premium/welcome?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/premium?checkout=cancelled&from=${encodeURIComponent(safePath(body.from))}`,
      });
      return json({ url: session.url });
    }

    if (body.action === 'portal') {
      if (!current.stripe_customer_id) return json({ error: "There's no billing account yet. Choose a Premium plan first." }, 404);
      const session = await stripeRequest(key, 'POST', 'billing_portal/sessions', {
        customer: current.stripe_customer_id,
        return_url: `${appOrigin(req)}/settings`,
      });
      return json({ url: session.url });
    }

    if (body.action === 'sync') {
      let customerId = current.stripe_customer_id as string | null;
      let checkout: { status: string; payment_status: string } | undefined;
      if (body.session_id) {
        if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(body.session_id)) return json({ error: 'Unknown checkout.' }, 400);
        const session = await stripeRequest(key, 'GET', `checkout/sessions/${body.session_id}`);
        if (session.client_reference_id !== user.id) return json({ error: 'This checkout belongs to a different account.' }, 403);
        customerId = session.customer;
        checkout = { status: session.status, payment_status: session.payment_status };
      }
      if (!customerId) return json({ subscription: current, checkout });
      const subscription = await syncCustomer(key, admin, user.id, customerId);
      return json({ subscription, checkout });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    if (error instanceof StripeError) {
      console.error('Stripe error', error.status, error.code, error.message);
      return json({ error: explainStripeError(error) }, error.status === 401 ? 503 : 400);
    }
    console.error('Billing failed', error);
    return json({ error: 'Something went wrong on our side. Nothing was charged; try again.' }, 500);
  }
});
