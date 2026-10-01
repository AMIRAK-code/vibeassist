import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CheckCircle2, X, Zap } from 'lucide-react';
import { friendlyError, supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';

export default function PremiumPaywall() {
  const navigate = useNavigate();
  const { refreshAccount } = useAuth();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  // Saves the plan to the account through the database's choose_plan function.
  // Demo checkout: no payment is taken until Stripe Checkout is wired in.
  const choosePlan = async (plan, cycle) => {
    setSaving(plan === 'free' ? 'free' : cycle);
    setError('');
    const { error: planError } = await supabase.rpc('choose_plan', { p_plan: plan, p_billing_cycle: cycle });
    if (planError) {
      setSaving('');
      setError(friendlyError(planError, 'Could not save your plan. Try again.'));
      return;
    }
    await refreshAccount();
    navigate('/dashboard', { replace: true });
  };

  const handleSubscribe = () => choosePlan('premium', billingCycle);
  const handlePromoSubscribe = () => choosePlan('premium', 'promo');
  // Continue as free tier
  const handleDecline = () => choosePlan('free', null);
  // Closing the paywall keeps whatever plan the account already has
  const handleClose = () => navigate('/dashboard', { replace: true });

  return (
    <div className="flex-center animate-fade-in" style={{ minHeight: '100vh', padding: '24px', background: 'var(--bg-color)' }}>
      <div className="glass-panel" style={{ maxWidth: '800px', width: '100%', padding: '40px', position: 'relative' }}>
        
        {/* Close Button = keep the current plan */}
        <button
          onClick={handleClose}
          aria-label="Close and go to the dashboard"
          style={{ position: 'absolute', top: '24px', right: '24px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>

        <div className="text-center mb-4">
          <Sparkles className="text-gradient" size={48} style={{ margin: '0 auto 16px' }} />
          <h2>Unlock <span className="text-gradient">VibeAssist Premium</span></h2>
          <p className="input-label mt-4" style={{ fontSize: '1.1rem' }}>Get the ultimate toolset to maximize your coding empire's profits.</p>
        </div>

        {/* Promo Banner */}
        <div className="glass-panel mb-4" style={{ background: 'rgba(0, 240, 255, 0.05)', borderColor: 'var(--accent-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="flex-center gap-4">
            <Zap color="var(--accent-2)" size={24} />
            <div>
              <h4 style={{ color: 'var(--accent-2)' }}>Limited Time Offer!</h4>
              <p className="input-label" style={{ fontSize: '0.9rem' }}>$12.99 for a 2-month trial of every premium service.</p>
            </div>
          </div>
          <button className="btn" style={{ background: 'var(--accent-2)', color: '#000' }} onClick={handlePromoSubscribe} disabled={Boolean(saving)}>
            {saving === 'promo' ? 'Saving…' : 'Claim Promo'}
          </button>
        </div>

        <div className="flex-center mb-4 gap-4">
          <button 
            className={`btn ${billingCycle === 'monthly' ? 'btn-primary' : 'btn-secondary'}`} 
            onClick={() => setBillingCycle('monthly')}
            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
          >
            Monthly
          </button>
          <button 
            className={`btn ${billingCycle === 'yearly' ? 'btn-primary' : 'btn-secondary'}`} 
            onClick={() => setBillingCycle('yearly')}
            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
          >
            Yearly (Save 20%)
          </button>
        </div>

        <div className="grid-2 mt-4">
          
          {/* Free Tier */}
          <div className="glass-panel" style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
            <h3>Free</h3>
            <h2 className="mt-4" style={{ fontSize: '2.5rem' }}>$0<span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>/mo</span></h2>
            <ul className="input-label flex-column gap-4 mt-4 mb-4" style={{ listStyle: 'none' }}>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 size={16} /> Basic Overall Income Dashboard</li>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 size={16} /> Vibe-coding Newsletter</li>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 size={16} /> Basic Legal Guidelines</li>
            </ul>
            <button className="btn btn-secondary w-full mt-auto" onClick={handleDecline} disabled={Boolean(saving)}>{saving === 'free' ? 'Saving…' : 'Continue Free'}</button>
          </div>

          {/* Premium Tier */}
          <div className="glass-panel" style={{ border: '2px solid var(--accent-1)', background: 'rgba(255, 46, 147, 0.03)', display: 'flex', flexDirection: 'column' }}>
            <h3 className="text-gradient">Premium Pro</h3>
            <h2 className="mt-4" style={{ fontSize: '2.5rem' }}>
              ${billingCycle === 'monthly' ? '19.99' : '15.99'}
              <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>/mo</span>
            </h2>
            {billingCycle === 'yearly' && <p style={{ fontSize: '0.8rem', color: 'var(--accent-1)', marginTop: '4px' }}>$191.88 billed once a year</p>}
            
            <ul className="input-label flex-column gap-4 mt-4 mb-4" style={{ listStyle: 'none', color: 'var(--text-primary)' }}>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 className="text-gradient" size={16} /> Advanced AI Business Analyzer</li>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 className="text-gradient" size={16} /> Deep Ad Optimization & YouTube Ads</li>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 className="text-gradient" size={16} /> Full API Integrations (Stripe/Apple/Google)</li>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 className="text-gradient" size={16} /> Automated Legal Document Generator</li>
            </ul>
            
            <button className="btn btn-primary w-full mt-auto" onClick={handleSubscribe} disabled={Boolean(saving)}>{saving === billingCycle ? 'Saving…' : 'Upgrade Now'}</button>
          </div>
        </div>

        {error && <p role="alert" className="text-center mt-4" style={{ color: '#d93025' }}>{error}</p>}
        <p className="input-label text-center mt-4" style={{ fontSize: '0.8rem' }}>
          Demo checkout: choosing a plan saves it to your account, but no payment is taken yet.
        </p>

      </div>
    </div>
  );
}
