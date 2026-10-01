import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Code, TrendingUp, Cpu, Newspaper, Megaphone, ShieldAlert, Sparkles, Lock, ShieldCheck, LogOut } from 'lucide-react';
import { supabase } from './lib/supabase';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/auth';
import FullPageSpinner from './components/FullPageSpinner';
import Landing from './pages/Landing';
import SignIn from './pages/SignIn';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import PremiumPaywall from './pages/PremiumPaywall';
import Integrations from './pages/Integrations';
import AIAnalyzer from './pages/AIAnalyzer';
import PublishingGuide from './pages/PublishingGuide';
import CampaignOverview from './pages/CampaignOverview';
import Newsletter from './pages/Newsletter';
import Orchestrator from './pages/Orchestrator';

function Sidebar() {
  const { user, hasPremium, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

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
        <div className="flex-between" style={{ marginTop: '16px', gap: '8px' }}>
          <span className="input-label" style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user?.email}>
            {user?.email}
          </span>
          <button className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem' }} onClick={handleSignOut}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function MainLayout() {
  return (
    <div className="app-container animate-fade-in">
      <Sidebar />
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}

// General Auth Guard (Free or Premium). Waits for the saved session to be restored,
// then sends signed-out visitors to sign in and brings them back afterwards.
// Redirects use `replace` so the Back button skips the guarded URL.
function AuthRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location }} />;
  return <MainLayout />;
}

// Premium Only Guard (nested inside AuthRoute, so the user is already signed in)
function PremiumRoute() {
  const { hasPremium } = useAuth();
  if (!hasPremium) return <Navigate to="/premium" replace />;
  return <Outlet />;
}

// The paywall is full-screen, but still needs a signed-in user
function PaywallRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location }} />;
  return <PremiumPaywall />;
}

function SetupRequired() {
  return (
    <div className="flex-center" style={{ minHeight: '100vh', padding: '24px' }}>
      <div className="glass-panel" style={{ maxWidth: '560px' }}>
        <h2>Connect Supabase</h2>
        <p className="input-label mt-4">
          VibeAssist needs <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in both values, and restart <code>npm run dev</code>.
        </p>
      </div>
    </div>
  );
}

function App() {
  if (!supabase) return <SetupRequired />;

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/premium" element={<PaywallRoute />} />

          <Route element={<AuthRoute />}>
            {/* Free Tier Accessible Routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/publishing" element={<PublishingGuide />} />
            <Route path="/newsletter" element={<Newsletter />} />

            {/* Premium Only Routes */}
            <Route element={<PremiumRoute />}>
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/ai-analyzer" element={<AIAnalyzer />} />
              <Route path="/ads" element={<CampaignOverview />} />
              <Route path="/orchestrator" element={<Orchestrator />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
