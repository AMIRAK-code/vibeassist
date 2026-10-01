import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Code, TrendingUp, Cpu, Newspaper, Megaphone, ShieldAlert, Sparkles, Lock, ShieldCheck } from 'lucide-react';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import PremiumPaywall from './pages/PremiumPaywall';
import Integrations from './pages/Integrations';
import AIAnalyzer from './pages/AIAnalyzer';
import PublishingGuide from './pages/PublishingGuide';
import CampaignOverview from './pages/CampaignOverview';
import Newsletter from './pages/Newsletter';
import Orchestrator from './pages/Orchestrator';

function Sidebar({ hasPremium }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  return (
    <div className="sidebar">
      <div className="flex-center mb-4">
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h2 className="text-gradient" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Code /> VibeAssist
          </h2>
        </Link>
      </div>
      
      <nav className="sidebar-nav">
        {/* Free Tier Accessible */}
        <Link to="/dashboard" className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}>
          <LayoutDashboard size={20} /> Overall Income
        </Link>
        <Link to="/publishing" className={`nav-item ${isActive('/publishing') ? 'active' : ''}`}>
          <ShieldAlert size={20} /> Legal & Publishing
        </Link>
        <Link to="/newsletter" className={`nav-item ${isActive('/newsletter') ? 'active' : ''}`}>
          <Newspaper size={20} /> News & Newsletter
        </Link>

        <div style={{ height: '1px', background: 'var(--panel-border)', margin: '8px 0' }} />

        {/* Premium Features */}
        <Link to="/integrations" className={`nav-item ${isActive('/integrations') ? 'active' : ''}`} style={{ opacity: hasPremium ? 1 : 0.6 }}>
          <TrendingUp size={20} /> Integrations {!hasPremium && <Lock size={14} style={{ marginLeft: 'auto' }} />}
        </Link>
        <Link to="/ai-analyzer" className={`nav-item ${isActive('/ai-analyzer') ? 'active' : ''}`} style={{ opacity: hasPremium ? 1 : 0.6 }}>
          <Cpu size={20} /> AI Business Analyzer {!hasPremium && <Lock size={14} style={{ marginLeft: 'auto' }} />}
        </Link>
        <Link to="/ads" className={`nav-item ${isActive('/ads') ? 'active' : ''}`} style={{ opacity: hasPremium ? 1 : 0.6 }}>
          <Megaphone size={20} /> Ad Manager {!hasPremium && <Lock size={14} style={{ marginLeft: 'auto' }} />}
        </Link>
        <Link to="/orchestrator" className={`nav-item ${isActive('/orchestrator') ? 'active' : ''}`} style={{ opacity: hasPremium ? 1 : 0.6 }}>
          <ShieldCheck size={20} /> Anti-Fragile Engine {!hasPremium && <Lock size={14} style={{ marginLeft: 'auto' }} />}
        </Link>
      </nav>

      <div style={{ marginTop: 'auto' }}>
        {hasPremium ? (
          <div className="glass-panel" style={{ padding: '16px', textAlign: 'center', borderColor: 'var(--accent-1)' }}>
            <Sparkles className="text-gradient" size={24} style={{ margin: '0 auto 8px' }} />
            <h4 style={{ marginBottom: '4px' }}>Premium Active</h4>
            <p className="input-label" style={{ fontSize: '0.8rem' }}>All pro features unlocked</p>
          </div>
        ) : (
          <Link to="/premium" style={{ textDecoration: 'none' }}>
            <div className="glass-panel" style={{ padding: '16px', textAlign: 'center', cursor: 'pointer', transition: 'var(--transition)' }}>
              <Sparkles className="text-gradient" size={24} style={{ margin: '0 auto 8px' }} />
              <h4 style={{ marginBottom: '4px' }}>Upgrade to Premium</h4>
              <p className="input-label" style={{ fontSize: '0.8rem' }}>Unlock AI & Integrations</p>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

function MainLayout({ children, hasPremium }) {
  return (
    <div className="app-container animate-fade-in">
      <Sidebar hasPremium={hasPremium} />
      <div className="main-content">
        {children}
      </div>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPremium, setHasPremium] = useState(false);

  // General Auth Guard (Free or Premium)
  const AuthRoute = ({ children }) => {
    if (!isAuthenticated) return <Navigate to="/onboarding" />;
    return <MainLayout hasPremium={hasPremium}>{children}</MainLayout>;
  };

  // Premium Only Guard
  const PremiumRoute = ({ children }) => {
    if (!isAuthenticated) return <Navigate to="/onboarding" />;
    if (!hasPremium) return <Navigate to="/premium" />;
    return <MainLayout hasPremium={hasPremium}>{children}</MainLayout>;
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        
        <Route 
          path="/onboarding" 
          element={<Onboarding onComplete={() => setIsAuthenticated(true)} />} 
        />
        
        <Route 
          path="/premium" 
          element={
            isAuthenticated ? 
            <PremiumPaywall 
              onSubscribe={() => setHasPremium(true)} 
              onSkip={() => setHasPremium(false)}
            /> : 
            <Navigate to="/onboarding" />
          } 
        />

        {/* Free Tier Accessible Routes */}
        <Route path="/dashboard" element={<AuthRoute><Dashboard /></AuthRoute>} />
        <Route path="/publishing" element={<AuthRoute><PublishingGuide /></AuthRoute>} />
        <Route path="/newsletter" element={<AuthRoute><Newsletter /></AuthRoute>} />
        
        {/* Premium Only Routes */}
        <Route path="/integrations" element={<PremiumRoute><Integrations /></PremiumRoute>} />
        <Route path="/ai-analyzer" element={<PremiumRoute><AIAnalyzer /></PremiumRoute>} />
        <Route path="/ads" element={<PremiumRoute><CampaignOverview /></PremiumRoute>} />
        <Route path="/orchestrator" element={<PremiumRoute><Orchestrator /></PremiumRoute>} />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
