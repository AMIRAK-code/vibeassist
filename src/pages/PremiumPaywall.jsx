import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CheckCircle2, X, Zap } from 'lucide-react';

export default function PremiumPaywall({ onSubscribe, onSkip }) {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState('monthly');

  const handleSubscribe = () => {
    // In production, this would trigger Stripe checkout
    alert('Redirecting to Stripe Checkout...');
    onSubscribe();
    navigate('/dashboard');
  };

  const handlePromoSubscribe = () => {
    alert('Redirecting to Stripe Checkout for $12.99 Promo...');
    onSubscribe();
    navigate('/dashboard');
  };

  const handleDecline = () => {
    // Continue as free tier
    onSkip();
    navigate('/dashboard');
  };

  return (
    <div className="flex-center animate-fade-in" style={{ minHeight: '100vh', padding: '24px', background: 'var(--bg-color)' }}>
      <div className="glass-panel" style={{ maxWidth: '800px', width: '100%', padding: '40px', position: 'relative' }}>
        
        {/* Close Button = Continue as Free */}
        <button 
          onClick={handleDecline}
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
          <button className="btn" style={{ background: 'var(--accent-2)', color: '#000' }} onClick={handlePromoSubscribe}>
            Claim Promo
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
            <button className="btn btn-secondary w-full mt-auto" onClick={handleDecline}>Continue Free</button>
          </div>

          {/* Premium Tier */}
          <div className="glass-panel" style={{ border: '2px solid var(--accent-1)', background: 'rgba(255, 46, 147, 0.03)', display: 'flex', flexDirection: 'column' }}>
            <h3 className="text-gradient">Premium Pro</h3>
            <h2 className="mt-4" style={{ fontSize: '2.5rem' }}>
              ${billingCycle === 'monthly' ? '19.99' : '15.99'}
              <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>/mo</span>
            </h2>
            {billingCycle === 'yearly' && <p style={{ fontSize: '0.8rem', color: 'var(--accent-2)', marginTop: '4px' }}>Billed annually</p>}
            
            <ul className="input-label flex-column gap-4 mt-4 mb-4" style={{ listStyle: 'none', color: 'var(--text-primary)' }}>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 className="text-gradient" size={16} /> Advanced AI Business Analyzer</li>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 className="text-gradient" size={16} /> Deep Ad Optimization & YouTube Ads</li>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 className="text-gradient" size={16} /> Full API Integrations (Stripe/Apple/Google)</li>
              <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '8px' }}><CheckCircle2 className="text-gradient" size={16} /> Automated Legal Document Generator</li>
            </ul>
            
            <button className="btn btn-primary w-full mt-auto" onClick={handleSubscribe}>Upgrade Now</button>
          </div>
        </div>

      </div>
    </div>
  );
}
