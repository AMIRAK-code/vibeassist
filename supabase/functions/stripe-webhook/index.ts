// Receives Stripe events and keeps each user's plan in step with their subscription:
// new subscriptions, renewals, failed payments and cancellations.
//
// Stripe calls this without a Supabase session, so JWT checks are off and every request
// must carry a valid Stripe-Signature for STRIPE_WEBHOOK_SECRET instead.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { StripeError, stripeRequest, syncCustomer, verifyStripeSignature } from '../_shared/stripe.ts';

const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function projectKey(newVar: string, legacyVar: string): string {
  try {
    const keys = JSON.parse(Deno.env.get(newVar) ?? '{}');
    if (keys.default) return keys.default;
  } catch {
    // fall through to the legacy key
  }
  return Deno.env.get(legacyVar) ?? '';
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  if (!key || !secret) return json({ error: 'not_configured' }, 503);

  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret))) {
    return json({ error: 'invalid_signature' }, 400);
  }

  const event = JSON.parse(payload);
  if (!HANDLED.has(event.type)) return json({ received: true, ignored: event.type });

  const object = event.data?.object ?? {};
  const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
  if (!customerId) return json({ received: true });

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  try {
    // Who this customer is: the stored link first, then the user id attached at checkout
    const { data: linked, error: linkError } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (linkError) throw linkError;
    let userId: unknown = linked?.user_id ?? object.metadata?.user_id ?? object.client_reference_id;
    if (!isUuid(userId)) {
      const customer = await stripeRequest(key, 'GET', `customers/${customerId}`);
      userId = customer.metadata?.user_id;
    }
    if (!isUuid(userId)) {
      // Not a VibeAssist customer (another product on the same Stripe account): nothing to do
      return json({ received: true, unmatched: true });
    }

    const subscription = await syncCustomer(key, admin, userId, customerId);
    return json({ received: true, plan: subscription?.plan ?? null });
  } catch (error) {
    // A 500 makes Stripe retry later, so a brief outage doesn't lose the update
    console.error('Webhook failed', event.type, error instanceof StripeError ? error.message : error);
    return json({ error: 'retry' }, 500);
  }
});
