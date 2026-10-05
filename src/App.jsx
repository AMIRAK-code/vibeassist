import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ListChecks, Megaphone, Plug, Rocket, Newspaper, Settings as SettingsIcon, LogOut, Menu, X } from 'lucide-react';
import { supabase } from './lib/supabase';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/auth';
import { ToastProvider } from './components/ui/Toast';
import FullPageSpinner from './components/FullPageSpinner';
import BrandMark from './components/landing/BrandMark';
import PremiumGate from './components/PremiumGate';
import PageErrorBoundary from './components/PageErrorBoundary';
import { initialAuthLinkError } from './lib/authErrors';
import Landing from './pages/Landing';
import SignIn from './pages/SignIn';
import ResetPassword from './pages/ResetPassword';
import Onboarding from './pages/Onboarding';

// Signed-in pages load on demand, so the landing and sign-in pages don't download charts
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PremiumPaywall = lazy(() => import('./pages/PremiumPaywall'));
const Integrations = lazy(() => import('./pages/Integrations'));
const Plan = lazy(() => import('./pages/Plan'));
const LaunchGuides = lazy(() => import('./pages/LaunchGuides'));
const CampaignOverview = lazy(() => import('./pages/CampaignOverview'));
const News = lazy(() => import('./pages/News'));
const Settings = lazy(() => import('./pages/Settings'));
const CheckoutReturn = lazy(() => import('./pages/CheckoutReturn'));
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })));
const Refunds = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Refunds })));

const WORK = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/plan', label: 'Plan', icon: ListChecks, premium: true },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone, premium: true },
  { to: '/data-sources', label: 'Data sources', icon: Plug, premium: true },
];
const REFERENCE = [
  { to: '/launch', label: 'Launch guides', icon: Rocket },
  { to: '/news', label: 'News', icon: Newspaper },
];
const ALL_PAGES = [...WORK, ...REFERENCE, { to: '/settings', label: 'Settings' }];

function NavItem({ item, hasPremium, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} onClick={onNavigate}>
      <Icon aria-hidden="true" /> {item.label}
      {item.premium && !hasPremium && <span className="nav-tag">Premium</span>}
    </NavLink>
  );
}

// The way into Premium, always in view for anyone who doesn't pay for it yet
function UpgradeCard({ subscription, onNavigate }) {
  const location = useLocation();
  const demoEnds = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  return (
    <div className="upgrade-card">
      <p className="upgrade-card-title">{demoEnds ? `Your demo Premium ends ${demoEnds}` : "You're on the Free plan"}</p>
      <p>Weekly plans from your numbers, Stripe imports and campaign tracking.</p>
      <Link to={`/premium?from=${encodeURIComponent(location.pathname)}`} className="btn btn-primary btn-sm w-full" onClick={onNavigate}>
        {demoEnds ? 'Subscribe' : 'Upgrade to Premium'}
      </Link>
    </div>
  );
}

function Sidebar({ open, onClose }) {
  const { user, hasPremium, subscription, signOut } = useAuth();
  const navigate = useNavigate();
  const demo = hasPremium && subscription?.source === 'demo';
  const planName = !hasPremium ? 'Free plan' : demo ? 'Demo Premium' : subscription.source === 'admin' ? 'Admin Premium' : 'Premium';
  const firstLink = useRef(null);

  // Mobile drawer: move focus in when it opens, close with Escape
  useEffect(() => {
    if (!open) return undefined;
    firstLink.current?.querySelector('a')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <>
      {open && <button type="button" className="drawer-scrim" aria-label="Close menu" onClick={onClose} />}
      <aside className={`app-sidebar${open ? ' is-open' : ''}`} aria-label="Main navigation" id="app-navigation">
        {/* The logo leads back to the homepage, as it always has */}
        <Link to="/" className="app-brand" aria-label="VibeAssist home" onClick={onClose}><BrandMark /> VibeAssist</Link>
        <nav className="app-nav" ref={firstLink}>
          {WORK.map((item) => <NavItem key={item.to} item={item} hasPremium={hasPremium} onNavigate={onClose} />)}
          <p className="app-nav-label">Reference</p>
          {REFERENCE.map((item) => <NavItem key={item.to} item={item} hasPremium={hasPremium} onNavigate={onClose} />)}
        </nav>
        {(!hasPremium || demo) && <UpgradeCard subscription={demo ? subscription : null} onNavigate={onClose} />}
        <div className="app-sidebar-footer app-nav">
          <NavLink to="/settings" onClick={onClose}><SettingsIcon aria-hidden="true" /> Settings</NavLink>
          <button type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start', minHeight: 38, fontWeight: 500 }} onClick={handleSignOut}>
            <LogOut aria-hidden="true" /> Sign out
          </button>
          <p className="app-account" title={user?.email}>
            {user?.email} · {planName}
          </p>
        </div>
      </aside>
    </>
  );
}

function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const toggle = useRef(null);
  const current = ALL_PAGES.find((p) => location.pathname.startsWith(p.to));

  const close = useCallback(() => {
    setMenuOpen((open) => {
      if (open) toggle.current?.focus();
      return false;
    });
  }, []);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar open={menuOpen} onClose={close} />
      <div className="app-main-wrap">
        <div className="app-topbar">
          <Link to="/" className="app-brand" aria-label="VibeAssist home"><BrandMark /> VibeAssist</Link>
          {current && <span className="app-topbar-title">{current.label}</span>}
          <button
            type="button"
            ref={toggle}
            className="btn btn-ghost btn-icon"
            aria-expanded={menuOpen}
            aria-controls="app-navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" />
            <span className="visually-hidden">Open menu</span>
          </button>
        </div>
        <main className="app-main" id="main" tabIndex={-1}>
          <div className="app-content">
            <PageErrorBoundary key={location.pathname}>
              <Suspense fallback={<div className="skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading page" />}>
                <Outlet />
              </Suspense>
            </PageErrorBoundary>
          </div>
        </main>
      </div>
      {menuOpen && (
        <button type="button" className="drawer-close btn btn-ghost btn-icon" onClick={close}>
          <X aria-hidden="true" /><span className="visually-hidden">Close menu</span>
        </button>
      )}
    </div>
  );
}

// Waits for the saved session, then sends signed-out visitors to sign in and brings them
// back to the page they asked for. Redirects use `replace` so Back skips the guarded URL.
function AuthRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location }} />;
  return <MainLayout />;
}

// Premium screens explain themselves in place instead of bouncing to the paywall
function PremiumRoute({ feature }) {
  const { hasPremium } = useAuth();
  if (!hasPremium) return <PremiumGate feature={feature} />;
  return <Outlet />;
}

function PaywallRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location }} />;
  return (
    <PageErrorBoundary>
      <Suspense fallback={<FullPageSpinner />}>
        <PremiumPaywall />
      </Suspense>
    </PageErrorBoundary>
  );
}

function SetupRequired() {
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Connect Supabase</h1>
        <p className="lead">
          VibeAssist needs <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in both values, and restart <code>npm run dev</code>.
        </p>
      </div>
    </div>
  );
}

// An emailed link that expired or was already used comes back with error details in the URL,
// possibly on a public page. Send the visitor to sign in, which explains it and offers a new link.
function AuthLinkErrorRedirect() {
  const navigate = useNavigate();
  const handled = useRef(false);
  useEffect(() => {
    if (!initialAuthLinkError || handled.current) return;
    handled.current = true;
    navigate('/signin', { replace: true, state: { linkError: initialAuthLinkError } });
  }, [navigate]);
  return null;
}

function App() {
  if (!supabase) return <SetupRequired />;

  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <AuthLinkErrorRedirect />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/premium" element={<PaywallRoute />} />
            <Route path="/terms" element={<Suspense fallback={<FullPageSpinner />}><Terms /></Suspense>} />
            <Route path="/privacy" element={<Suspense fallback={<FullPageSpinner />}><Privacy /></Suspense>} />
            <Route path="/refunds" element={<Suspense fallback={<FullPageSpinner />}><Refunds /></Suspense>} />

            <Route element={<AuthRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/launch" element={<LaunchGuides />} />
              <Route path="/news" element={<News />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/premium/welcome" element={<CheckoutReturn />} />
              <Route element={<PremiumRoute feature="plan" />}>
                <Route path="/plan" element={<Plan />} />
              </Route>
              <Route element={<PremiumRoute feature="campaigns" />}>
                <Route path="/campaigns" element={<CampaignOverview />} />
              </Route>
              <Route element={<PremiumRoute feature="data-sources" />}>
                <Route path="/data-sources" element={<Integrations />} />
              </Route>
            </Route>

            {/* Earlier addresses keep working */}
            <Route path="/ai-analyzer" element={<Navigate to="/plan" replace />} />
            <Route path="/ads" element={<Navigate to="/campaigns" replace />} />
            <Route path="/integrations" element={<Navigate to="/data-sources" replace />} />
            <Route path="/publishing" element={<Navigate to="/launch" replace />} />
            <Route path="/newsletter" element={<Navigate to="/news" replace />} />
            <Route path="/orchestrator" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
