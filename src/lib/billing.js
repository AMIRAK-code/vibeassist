import { callFunction } from './supabase';

export const isActivePremium = (subscription, now = new Date()) =>
  subscription?.plan === 'premium' &&
  (!subscription.current_period_end || new Date(subscription.current_period_end) > now);

const CYCLES = { monthly: 'monthly', yearly: 'yearly', promo: 'two-month trial' };
const formatDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// One line about the plan for Settings: what it is, and what happens next
export function planSummary(subscription, now = new Date()) {
  if (!isActivePremium(subscription, now)) {
    return { label: 'Free', detail: 'Overview, manual entry, launch guides and news.' };
  }
  if (subscription.source === 'admin') {
    return { label: 'Premium (admin)', detail: 'Given to this account by an admin. Nothing is billed and it doesn’t expire.' };
  }
  const cycle = CYCLES[subscription.billing_cycle];
  const until = subscription.current_period_end ? formatDate(subscription.current_period_end) : null;
  if (subscription.source !== 'stripe') {
    return {
      label: `Premium (demo${cycle ? `, ${cycle}` : ''})`,
      detail: until ? `A free demo plan that ends on ${until} and won't renew. Subscribe to keep Premium after that.` : 'A free demo plan.',
    };
  }
  const label = cycle ? `Premium, ${cycle}` : 'Premium';
  if (subscription.status === 'past_due') {
    return { label, detail: "Your last payment didn't go through. Update your card to keep Premium.", warning: true };
  }
  if (subscription.cancel_at_period_end) {
    return { label, detail: until ? `Cancelled. Premium stays on until ${until}, then you're on Free.` : 'Cancelled.' };
  }
  if (subscription.status === 'trialing') return { label, detail: until ? `Trial until ${until}.` : 'Trial.' };
  return { label, detail: until ? `Renews on ${until}.` : 'Active.' };
}

// Each returns { url } to leave for, or { error, notConfigured? } to show
async function billing(body) {
  const { data, status } = await callFunction('billing', body);
  if (status === 200 && data?.url) return { url: data.url };
  if (status === 200) return data;
  if (data?.error === 'not_configured') return { error: "Payments aren't switched on yet.", notConfigured: true };
  if (data?.error === 'already_subscribed') return { error: 'You already have Premium. Manage it from Settings.', alreadySubscribed: true };
  return { error: data?.error ?? 'Could not reach billing. Check your connection and try again.' };
}

export const startCheckout = (cycle, from) => billing({ action: 'checkout', cycle, from });
export const openBillingPortal = () => billing({ action: 'portal' });
export const syncBilling = (sessionId) => billing({ action: 'sync', session_id: sessionId || undefined });
export const billingConfig = () => billing({ action: 'config' });
