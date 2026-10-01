import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { friendlyError, supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import BrandMark from '../components/landing/BrandMark';
import Notice from '../components/ui/Notice';

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
  const { refreshAccount, hasPremium, subscription } = useAuth();
  const [cycle, setCycle] = useState('monthly');
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Plans · VibeAssist';
  }, []);

  const choosePlan = async (plan, billingCycle) => {
    if (saving) return;
    setSaving(plan === 'free' ? 'free' : billingCycle);
    setError('');
    const { error: planError } = await supabase.rpc('choose_plan', { p_plan: plan, p_billing_cycle: billingCycle });
    if (planError) {
      setSaving('');
      setError(friendlyError(planError, 'Could not change your plan. Check your connection and try again.'));
      return;
    }
    await refreshAccount();
    toast.show({ message: plan === 'free' ? "You're on the Free plan." : 'Premium is on. Everything is unlocked.' });
    navigate(plan === 'free' ? '/dashboard' : returnTo, { replace: true });
  };

  const currentPremium = hasPremium && subscription?.billing_cycle;

  return (
    <main className="auth-page paywall">
      <div className="paywall-inner">
        <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <Link to="/dashboard" className="auth-brand" style={{ marginBottom: 0 }}><BrandMark /> VibeAssist</Link>
          <Link to={returnTo} className="btn btn-ghost"><ArrowLeft aria-hidden="true" /> Back</Link>
        </div>
        <h1>Plans</h1>
        <p className="lead muted" style={{ marginTop: 4 }}>Start free. Upgrade when you want plans written from your numbers and automatic imports.</p>

        <div className="segmented" role="group" aria-label="Billing" style={{ marginTop: 20 }}>
          <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')}>Monthly</button>
          <button type="button" aria-pressed={cycle === 'yearly'} onClick={() => setCycle('yearly')}>Yearly · 20% less</button>
        </div>

        <div className="plan-grid">
          <section className="card plan-option" aria-labelledby="free-title">
            <h2 id="free-title">Free</h2>
            <p className="plan-price">$0</p>
            <ul>{FREE.map((f) => <li key={f}><Check aria-hidden="true" /> {f}</li>)}</ul>
            <button type="button" className="btn btn-secondary w-full" onClick={() => choosePlan('free', null)} disabled={Boolean(saving) || !hasPremium} aria-busy={saving === 'free'}>
              {!hasPremium ? 'Your current plan' : saving === 'free' ? 'Switching…' : 'Switch to Free'}
            </button>
          </section>

          <section className="card card--raised plan-option plan-option--featured" aria-labelledby="premium-title">
            <h2 id="premium-title">Premium</h2>
            <p className="plan-price">{cycle === 'monthly' ? '$19.99' : '$15.99'}<span> / month</span></p>
            <p className="field-help">{cycle === 'monthly' ? 'Billed monthly.' : '$191.88 billed once a year.'}</p>
            <ul>{PREMIUM.map((f) => <li key={f}><Check aria-hidden="true" /> {f}</li>)}</ul>
            <button type="button" className="btn btn-primary w-full" onClick={() => choosePlan('premium', cycle)} disabled={Boolean(saving) || currentPremium === cycle} aria-busy={saving === cycle}>
              {currentPremium === cycle ? 'Your current plan' : saving === cycle ? 'Saving…' : `Choose Premium ${cycle}`}
            </button>
            <button type="button" className="btn btn-ghost w-full" style={{ marginTop: 6 }} onClick={() => choosePlan('premium', 'promo')} disabled={Boolean(saving) || currentPremium === 'promo'}>
              {saving === 'promo' ? 'Saving…' : 'Or try two months for $12.99'}
            </button>
          </section>
        </div>

        {error && <div style={{ marginTop: 16 }}><Notice tone="error">{error}</Notice></div>}
        <p className="field-help" style={{ marginTop: 16 }}>
          Checkout is in demo mode: choosing a plan saves it to your account but no payment is taken.
        </p>
      </div>
    </main>
  );
}
