import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Code, PlayCircle, ShieldCheck, TrendingUp } from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Navbar */}
      <nav style={{ padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)' }}>
        <div className="flex-center gap-4">
          <Code className="text-gradient" size={32} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>VibeAssist</h2>
        </div>
        <div className="flex-center gap-4">
          <button className="btn btn-secondary" onClick={() => navigate('/onboarding')}>Sign In</button>
          <button className="btn btn-primary" onClick={() => navigate('/onboarding')}>Get Started <Sparkles size={16} /></button>
        </div>
      </nav>

      {/* Hero Section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(255, 46, 147, 0.1)', color: 'var(--accent-1)', padding: '8px 16px', borderRadius: '20px', fontSize: '0.9rem', marginBottom: '24px', fontWeight: 'bold' }}>
          ✨ The #1 Platform for Indie Hackers & Vibe Coders
        </div>
        
        <h1 style={{ fontSize: '4.5rem', lineHeight: '1.1', maxWidth: '800px', marginBottom: '24px' }}>
          Build your empire.<br />
          <span className="text-gradient">Maximize your profits.</span>
        </h1>
        
        <p className="input-label" style={{ fontSize: '1.2rem', maxWidth: '600px', marginBottom: '40px', lineHeight: '1.6' }}>
          Connect all your developer accounts (Apple, Google, Stripe). Let our AI analyze your business plan, optimize your ads, and handle legal compliance automatically.
        </p>

        <div className="flex-center gap-4">
          <button className="btn btn-primary" style={{ padding: '16px 32px', fontSize: '1.1rem' }} onClick={() => navigate('/onboarding')}>
            Start Building Now
          </button>
          <button className="btn btn-secondary" style={{ padding: '16px 32px', fontSize: '1.1rem' }}>
            <PlayCircle size={20} /> Watch Demo
          </button>
        </div>

        {/* Demo App Visual (Mockup) */}
        <div className="glass-panel mt-4" style={{ marginTop: '64px', width: '100%', maxWidth: '1000px', padding: '8px', border: '1px solid var(--accent-2)', boxShadow: '0 20px 60px rgba(0, 240, 255, 0.15)' }}>
          <div style={{ background: '#0a0a0f', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--panel-border)' }}>
            
            {/* Fake Dashboard Header */}
            <div style={{ height: '40px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px', borderBottom: '1px solid var(--panel-border)' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }} />
            </div>

            {/* Fake Dashboard Content */}
            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
              <div className="flex-between">
                <div>
                  <h3 style={{ fontSize: '1.5rem' }}>Overview</h3>
                  <p className="input-label">Real-time metrics</p>
                </div>
                <div style={{ padding: '8px 16px', background: 'var(--accent-gradient)', borderRadius: '8px', color: 'white', fontWeight: 'bold' }}>
                  $14,250 Today
                </div>
              </div>

              <div className="grid-3">
                <div style={{ height: '100px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--panel-border)', padding: '16px' }}>
                  <TrendingUp color="var(--accent-1)" />
                  <p style={{ marginTop: '16px', fontWeight: 'bold', fontSize: '1.2rem' }}>+24% Growth</p>
                </div>
                <div style={{ height: '100px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--panel-border)', padding: '16px' }}>
                  <ShieldCheck color="var(--accent-2)" />
                  <p style={{ marginTop: '16px', fontWeight: 'bold', fontSize: '1.2rem' }}>Legal Compliant</p>
                </div>
                <div style={{ height: '100px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--panel-border)', padding: '16px' }}>
                  <Sparkles color="white" />
                  <p style={{ marginTop: '16px', fontWeight: 'bold', fontSize: '1.2rem' }}>AI Optimized</p>
                </div>
              </div>
              
              {/* Play Overlay */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', padding: '16px', cursor: 'pointer', border: '2px solid rgba(255,255,255,0.5)', backdropFilter: 'blur(4px)' }}>
                <PlayCircle size={48} color="white" />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
