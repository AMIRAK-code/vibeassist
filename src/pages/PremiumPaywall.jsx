import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CheckCircle2, X } from 'lucide-react';

export default function PremiumPaywall({ onSubscribe }) {
  const navigate = useNavigate();

  const handleSubscribe = () => {
    // In production, this would trigger Stripe checkout
    alert('Redirecting to Stripe Checkout...');
    onSubscribe();
    navigate('/dashboard');
  };

  const handleDecline = () => {
    // If they decline, they can't use the app. Return to landing.
    alert('Access to VibeAssist requires an active Premium plan.');
    navigate('/');
  };

  return (
    <div className="flex-center animate-fade-in" style={{ minHeight: '100vh', padding: '24px', background: 'var(--bg-color)' }}>
      <div className="glass-panel" style={{ maxWidth: '600px', width: '100%', padding: '40px', position: 'relative' }}>
        
        {/* Close Button = Decline */}
        <button 
          onClick={handleDecline}
          style={{ position: 'absolute', top: '24px', right: '24px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>

        <div className="text-center mb-4">
          <Sparkles className="text-gradient" size={48} style={{ margin: '0 auto 16px' }} />
          <h2>Unlock <span className="text-gradient">VibeAssist Premium</span></h2>
          <p className="input-label mt-4" style={{ fontSize: '1.1rem' }}>You're almost there! Activate your account to access the dashboard and AI features.</p>
        </div>

        <div className="glass-panel mt-4" style={{ border: '2px solid var(--accent-1)', background: 'rgba(255, 46, 147, 0.03)' }}>
          <div className="flex-between">
            <h3 className="text-gradient">Premium Pro</h3>
            <h2 style={{ fontSize: '2.5rem' }}>$19<span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>/mo</span></h2>
          </div>
          
          <ul className="input-label flex-column gap-4 mt-4 mb-4" style={{ listStyle: 'none', color: 'var(--text-primary)' }}>
            <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '12px' }}>
              <CheckCircle2 className="text-gradient" size={20} /> Full Sales & Download Tracking
            </li>
            <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '12px' }}>
              <CheckCircle2 className="text-gradient" size={20} /> Advanced AI Business Analyzer
            </li>
            <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '12px' }}>
              <CheckCircle2 className="text-gradient" size={20} /> Deep Ad Optimization insights
            </li>
            <li className="flex-center" style={{ justifyContent: 'flex-start', gap: '12px' }}>
              <CheckCircle2 className="text-gradient" size={20} /> Legal Document Generator
            </li>
          </ul>
          
          <button className="btn btn-primary w-full mt-4" style={{ padding: '16px', fontSize: '1.1rem' }} onClick={handleSubscribe}>
            Activate Account via Stripe
          </button>
          
          <div className="text-center mt-4">
            <button 
              onClick={handleDecline}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}
            >
              No thanks, take me back to home
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
