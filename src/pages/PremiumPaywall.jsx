import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Lock } from 'lucide-react';
import { friendlyError, supabase } from '../lib/supabase';
import { billingConfig, openBillingPortal, startCheckout } from '../lib/billing';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import BrandMark from '../components/landing/BrandMark';
import Notice from '../components/ui/Notice';
import LegalLinks from '../components/LegalLinks';

const FREE = [
  'Overview of revenue, profit, downloads and conversion',
  'Add days by hand and export everything as CSV',
  'Launch checklists for iOS, Android, web and Windows',
  'Hacker News feed for app makers',
];
const PREMIUM = [
  'Weekly plan written by Claude from your own numbers',
  'Ask questions about your numbers (30 advisor requests a day)',
  'Import revenue from Stripe, or send numbers from your apps',
  'Track ad campaigns with return on ad spend and cost per install',
];

// Only allow returning to pages inside the app
const safeReturn = (path) => (path && path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard');

export default function PremiumPaywall() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const returnTo = safeReturn(params.get('from'));
  const cancelled = params.get('checkout') === 'cancelled';
  const { refreshAccount, hasPremium, subscription } = useAuth();
  const [cycle, setCycle] = useState('monthly');
  const [config, setConfig] = useState(null); // { configured, livemode } once known
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmingFree, setConfirmingFree] = useState(false);

  const paid = hasPremium && subscription?.source === 'stripe';
  const demo = hasPremium && subscription?.source === 'demo';
  const admin = hasPremium && subscription?.source === 'admin';

  useEffect(() => {
    document.title = 'Plans · VibeAssist';
    let alive = true;
    billingConfig().then((result) => alive && setConfig(result?.configured === undefined ? { configured: null } : result));
    // Coming back from Stripe with the Back button restores this page as it was left
    const onShow = (e) => e.persisted && setBusy('');
    window.addEventListener('pageshow', onShow);
    return () => {
      alive = false;
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  const leaveFor = async (action, label) => {
    if (busy) return;
    setBusy(label);
    setError('');
    const result = await action();
    if (result.url) {
      window.location.assign(result.url); // stays busy while the browser leaves
      return;
    }
    setBusy('');
    if (result.notConfigured) setConfig({ configured: false });
    if (result.alreadySubscribed) await refreshAccount();
    setError(result.error);
  };

  const switchDemoToFree = async () => {
    setBusy('free');
    const { error: planError } = await supabase.rpc('choose_plan', { p_plan: 'free', p_billing_cycle: null });
    setBusy('');
    if (planError) {
      setError(friendlyError(planError, 'Could not change your plan. Check your connection and try again.'));
      return;
    }
    await refreshAccount();
    toast.show({ message: "You're on the Free plan. Your data, plans and campaigns are kept." });
    navigate('/dashboard', { replace: true });
  };

  const unavailable = config?.configured === false;
  // Must match PREMIUM_PRICES in supabase/functions/_shared/stripe.ts
  const price = cycle === 'monthly' ? '$9.99' : '$4.99';

  return (
    <main className="auth-page paywall">
      <div className="paywall-inner">
        <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <Link to="/dashboard" className="auth-brand" style={{ marginBottom: 0 }}><BrandMark /> VibeAssist</Link>
          <Link to={returnTo} className="btn btn-ghost"><ArrowLeft aria-hidden="true" /> Back</Link>
        </div>
        <h1>Plans</h1>
        <p className="lead muted" style={{ marginTop: 4 }}>Start free. Upgrade when you want plans written from your numbers and automatic imports.</p>

        {cancelled && !paid && (
          <div style={{ marginTop: 16 }}><Notice tone="info">Checkout was cancelled, so you weren't charged. Pick a plan whenever you're ready.</Notice></div>
        )}
        {unavailable && (
          <div style={{ marginTop: 16 }}>
            <Notice tone="warning" title="Premium can't be bought just yet">
              Payments aren't switched on for this site. Nothing can be charged until they are; please check back soon.
              <span className="field-help" style={{ display: 'block', marginTop: 4 }}>Site owner: add the Stripe keys described in docs/payments-and-email.md.</span>
            </Notice>
          </div>
        )}
        {config?.configured && !config.livemode && !paid && !admin && (
          <div style={{ marginTop: 16 }}>
            <Notice tone="info" title="Test mode">
              No real money moves. Pay with card 4242 4242 4242 4242, any future expiry date and any CVC.
            </Notice>
          </div>
        )}

        <div className="segmented" role="group" aria-label="Billing" style={{ marginTop: 20 }}>
          <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')}>Monthly</button>
          <button type="button" aria-pressed={cycle === 'yearly'} onClick={() => setCycle('yearly')}>Yearly · 50% off</button>
        </div>

        <div className="plan-grid">
          <section className="card plan-option" aria-labelledby="free-title">
            <h2 id="free-title">Free</h2>
            <p className="plan-price">$0</p>
            <ul>{FREE.map((f) => <li key={f}><Check aria-hidden="true" /> {f}</li>)}</ul>
            {!hasPremium && <button type="button" className="btn btn-secondary w-full" disabled>Your current plan</button>}
            {paid && <p className="field-help">To move to Free, cancel in Manage billing. Premium stays on until the end of the period you paid for.</p>}
            {demo && !confirmingFree && (
              <button type="button" className="btn btn-secondary w-full" onClick={() => setConfirmingFree(true)} disabled={Boolean(busy)}>Switch to Free</button>
            )}
            {demo && confirmingFree && (
              <div className="inline-confirm" role="group" aria-label="Confirm switching to Free">
                Your demo Premium can't be turned back on.
                <button type="button" className="btn btn-danger btn-sm" onClick={switchDemoToFree} disabled={busy === 'free'}>{busy === 'free' ? 'Switching…' : 'Switch to Free'}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingFree(false)} disabled={busy === 'free'}>Cancel</button>
              </div>
            )}
          </section>

          <section className="card card--raised plan-option plan-option--featured" aria-labelledby="premium-title">
            <h2 id="premium-title">Premium</h2>
            <p className="plan-price">
              {cycle === 'yearly' && <s className="plan-price-was"><span className="visually-hidden">Was </span>$9.99<span className="visually-hidden">, now</span></s>}
              {price}<span> / month</span>
            </p>
            <p className="field-help">{cycle === 'monthly' ? 'Billed monthly. Cancel any time.' : '$59.88 billed once a year, half the monthly price. Cancel any time.'} Plus VAT where it applies, shown at checkout.</p>
            <ul>{PREMIUM.map((f) => <li key={f}><Check aria-hidden="true" /> {f}</li>)}</ul>
            {admin ? (
              <>
                <button type="button" className="btn btn-secondary w-full" disabled>Your current plan</button>
                <p className="field-help" style={{ marginTop: 8 }}>Admin Premium: given to this account, with nothing billed.</p>
              </>
            ) : paid ? (
              <button type="button" className="btn btn-primary w-full" onClick={() => leaveFor(openBillingPortal, 'portal')} disabled={Boolean(busy)} aria-busy={busy === 'portal'}>
                {busy === 'portal' ? <><span className="spinner spinner--light" /> Opening billing…</> : 'Manage billing'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => leaveFor(() => startCheckout(cycle, returnTo), 'checkout')}
                disabled={Boolean(busy) || unavailable}
                aria-busy={busy === 'checkout'}
              >
                {busy === 'checkout' ? <><span className="spinner spinner--light" /> Opening checkout…</> : `Continue to checkout · ${cycle}`}
              </button>
            )}
            {!paid && !admin && (
              <p className="field-help" style={{ marginTop: 8 }}>
                By continuing you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy policy</Link>. Have a promo code? Enter it at checkout.
              </p>
            )}
          </section>
        </div>

        {error && <div style={{ marginTop: 16 }}><Notice tone="error">{error}</Notice></div>}
        <p className="field-help" style={{ marginTop: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Lock aria-hidden="true" style={{ width: 14, height: 14 }} /> Payment happens on Stripe's secure checkout page; VibeAssist never sees your card.
        </p>
        <LegalLinks />
      </div>
    </main>
  );
}
