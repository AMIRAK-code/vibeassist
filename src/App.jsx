import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BadgeCheck, Cpu, LayoutDashboard, ShieldCheck, ListChecks, Lock, Megaphone, Newspaper, Settings as SettingsIcon, ShieldAlert, TrendingUp, LogOut, Menu, X } from 'lucide-react';
import { supabase } from './lib/supabase';
import { AuthProvider } from './context/AuthContext';
import { PresetProvider } from './context/PresetContext';
import { useAppPreset } from './context/preset';
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
const AIAnalyzer = lazy(() => import('./pages/AIAnalyzer'));
const Orchestrator = lazy(() => import('./pages/Orchestrator'));
const OrchestratorApi = lazy(() => import('./pages/OrchestratorApi'));
const Publishing = lazy(() => import('./pages/Publishing'));
const CampaignOverview = lazy(() => import('./pages/CampaignOverview'));
const Newsletter = lazy(() => import('./pages/Newsletter'));
const NewsletterConfirm = lazy(() => import('./pages/NewsletterLinks').then((m) => ({ default: m.NewsletterConfirm })));
const NewsletterUnsubscribe = lazy(() => import('./pages/NewsletterLinks').then((m) => ({ default: m.NewsletterUnsubscribe })));
const Settings = lazy(() => import('./pages/Settings'));
const CheckoutReturn = lazy(() => import('./pages/CheckoutReturn'));
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })));
const Refunds = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Refunds })));

const FREE_PAGES = [
  { to: '/dashboard', label: 'Overall Income', icon: LayoutDashboard },
  { to: '/publishing', label: 'Legal & Publishing', icon: ShieldAlert },
  { to: '/newsletter', label: 'News & Newsletter', icon: Newspaper },
];
const PREMIUM_PAGES = [
  { to: '/integrations', label: 'Integrations', icon: TrendingUp, premium: true },
  { to: '/ai-analyzer', label: 'AI Business Analyzer', icon: Cpu, premium: true },
  { to: '/plan', label: 'Weekly Plan', icon: ListChecks, premium: true },
  { to: '/ads', label: 'Ad Manager', icon: Megaphone, premium: true },
  { to: '/orchestrator', label: 'Anti-Fragile Engine', icon: ShieldCheck, premium: true },
];
const ALL_PAGES = [...FREE_PAGES, ...PREMIUM_PAGES, { to: '/settings', label: 'Settings' }];

function NavItem({ item, hasPremium, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} onClick={onNavigate}>
      <Icon aria-hidden="true" /> {item.label}
      {item.premium && !hasPremium && (
        <>
          <Lock className="nav-lock" aria-hidden="true" />
          <span className="visually-hidden"> (Premium)</span>
        </>
      )}
    </NavLink>
  );
}

// Paying (or admin) members see what they have instead of an upgrade pitch
function PremiumActiveCard({ onNavigate }) {
  return (
    <div className="upgrade-card upgrade-card--active">
      <p className="upgrade-card-title"><BadgeCheck aria-hidden="true" /> Premium Active</p>
      <p>All pro features unlocked.</p>
      <Link to="/settings#plan" className="btn btn-secondary btn-sm w-full" onClick={onNavigate}>Plan & billing</Link>
    </div>
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
      <p className="upgrade-card-title">{demoEnds ? `Your ${subscription.source === 'pass' ? 'pass' : 'demo Premium'} ends ${demoEnds}` : "You're on the Free plan"}</p>
      <p>Unlock the AI tools, integrations and the Ad Manager.</p>
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
  const pass = hasPremium && subscription?.source === 'pass';
  const planName = !hasPremium ? 'Free plan' : demo ? 'Demo Premium' : pass ? 'Premium pass' : subscription.source === 'admin' ? 'Admin Premium' : 'Premium';
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
          {FREE_PAGES.map((item) => <NavItem key={item.to} item={item} hasPremium={hasPremium} onNavigate={onClose} />)}
          <div className="app-nav-divider" role="separator" />
          {PREMIUM_PAGES.map((item) => <NavItem key={item.to} item={item} hasPremium={hasPremium} onNavigate={onClose} />)}
        </nav>
        {(!hasPremium || demo || pass)
          ? <UpgradeCard subscription={demo || pass ? subscription : null} onNavigate={onClose} />
          : <PremiumActiveCard onNavigate={onClose} />}
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
  // Simple or Advanced look for the signed-in app; the landing page is outside this layout
  useAppPreset();
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
      <PresetProvider>
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
              <Route path="/newsletter/confirm" element={<Suspense fallback={<FullPageSpinner />}><NewsletterConfirm /></Suspense>} />
              <Route path="/newsletter/unsubscribe" element={<Suspense fallback={<FullPageSpinner />}><NewsletterUnsubscribe /></Suspense>} />

              <Route element={<AuthRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/publishing" element={<Publishing />} />
                <Route path="/newsletter" element={<Newsletter />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/premium/welcome" element={<CheckoutReturn />} />
                <Route element={<PremiumRoute feature="ai-analyzer" />}>
                  <Route path="/ai-analyzer" element={<AIAnalyzer />} />
                </Route>
                <Route element={<PremiumRoute feature="orchestrator" />}>
                  <Route path="/orchestrator" element={<Orchestrator />} />
                  <Route path="/orchestrator/api" element={<OrchestratorApi />} />
                </Route>
                <Route element={<PremiumRoute feature="plan" />}>
                  <Route path="/plan" element={<Plan />} />
                </Route>
                <Route element={<PremiumRoute feature="ads" />}>
                  <Route path="/ads" element={<CampaignOverview />} />
                </Route>
                <Route element={<PremiumRoute feature="integrations" />}>
                  <Route path="/integrations" element={<Integrations />} />
                </Route>
              </Route>

              {/* Addresses from the Oct 1 layout keep working */}
              <Route path="/campaigns" element={<Navigate to="/ads" replace />} />
              <Route path="/data-sources" element={<Navigate to="/integrations" replace />} />
              <Route path="/launch" element={<Navigate to="/publishing" replace />} />
              <Route path="/news" element={<Navigate to="/newsletter" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </ToastProvider>
      </PresetProvider>
    </AuthProvider>
  );
}

export default App;
