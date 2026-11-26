import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRightLeft, BadgeCheck, Cpu, LayoutDashboard, ShieldCheck, ListChecks, Lock,
  Megaphone, Newspaper, Plug, Search, Settings as SettingsIcon, ShieldAlert, Sparkles,
  LogOut, Menu, X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { AuthProvider } from './context/AuthContext';
import { PresetProvider } from './context/PresetContext';
import { useAppPreset } from './context/preset';
import { useAuth } from './context/auth';
import { useImportedAi } from './lib/aiClient';
import { isDesktopApp } from './lib/desktopBridge';
import { ToastProvider } from './components/ui/Toast';
import FullPageSpinner from './components/FullPageSpinner';
import BrandMark from './components/landing/BrandMark';
import PremiumGate from './components/PremiumGate';
import PageErrorBoundary from './components/PageErrorBoundary';
import CommandPalette from './components/CommandPalette';
import { initialAuthLinkError } from './lib/authErrors';
import Landing from './pages/Landing';
import SignIn from './pages/SignIn';
import ResetPassword from './pages/ResetPassword';
import Onboarding from './pages/Onboarding';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ImportAI = lazy(() => import('./pages/ImportAI'));
const PremiumPaywall = lazy(() => import('./pages/PremiumPaywall'));
const Integrations = lazy(() => import('./pages/Integrations'));
const Plan = lazy(() => import('./pages/Plan'));
const AIAnalyzer = lazy(() => import('./pages/AIAnalyzer'));
const Orchestrator = lazy(() => import('./pages/Orchestrator'));
const OrchestratorApi = lazy(() => import('./pages/OrchestratorApi'));
const Publishing = lazy(() => import('./pages/Publishing'));
const CampaignOverview = lazy(() => import('./pages/CampaignOverview'));
const Newsletter = lazy(() => import('./pages/Newsletter'));
const Handoffs = lazy(() => import('./pages/Handoffs'));
const SharedHandoff = lazy(() => import('./pages/SharedHandoff'));
const NewsletterConfirm = lazy(() => import('./pages/NewsletterLinks').then((m) => ({ default: m.NewsletterConfirm })));
const NewsletterUnsubscribe = lazy(() => import('./pages/NewsletterLinks').then((m) => ({ default: m.NewsletterUnsubscribe })));
const Settings = lazy(() => import('./pages/Settings'));
const CheckoutReturn = lazy(() => import('./pages/CheckoutReturn'));
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })));
const Refunds = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Refunds })));

const FREE_PAGES = [
  { to: '/dashboard', label: 'Overall Income', icon: LayoutDashboard },
  { to: '/ai-models', label: 'Import Your AI', icon: Sparkles },
  { to: '/integrations', label: 'Connections & Data', icon: Plug },
  { to: '/publishing', label: 'Legal & Security', icon: ShieldAlert },
  { to: '/handoffs', label: 'Context Handoffs', icon: ArrowRightLeft },
  { to: '/newsletter', label: 'News & Newsletter', icon: Newspaper },
];
const PREMIUM_PAGES = [
  { to: '/ai-analyzer', label: 'AI Business Analyzer', icon: Cpu, premium: true, byokUnlock: true },
  { to: '/plan', label: 'Weekly Plan', icon: ListChecks, premium: true, byokUnlock: true },
  { to: '/ads', label: 'Ad Manager', icon: Megaphone, premium: true },
  { to: '/orchestrator', label: 'Anti-Fragile Engine', icon: ShieldCheck, premium: true },
];
const ALL_PAGES = [...FREE_PAGES, ...PREMIUM_PAGES, { to: '/settings', label: 'Settings' }];

function NavItem({ item, hasPremium, hasByok, aiBadge, onNavigate }) {
  const Icon = item.icon;
  const locked = item.premium && !hasPremium && !(item.byokUnlock && hasByok);
  return (
    <NavLink to={item.to} onClick={onNavigate}>
      <Icon aria-hidden="true" /> {item.label}
      {item.to === '/ai-models' && aiBadge && (
        <span className="badge badge--cobalt" style={{ marginLeft: 'auto', fontSize: 10.5, padding: '1px 6px' }}>{aiBadge}</span>
      )}
      {locked && (
        <>
          <Lock className="nav-lock" aria-hidden="true" />
          <span className="visually-hidden"> (Premium)</span>
        </>
      )}
    </NavLink>
  );
}

function PremiumActiveCard({ onNavigate }) {
  return (
    <div className="upgrade-card upgrade-card--active">
      <p className="upgrade-card-title"><BadgeCheck aria-hidden="true" /> Premium Active</p>
      <p>All pro features unlocked.</p>
      <Link to="/settings#plan" className="btn btn-secondary btn-sm w-full" onClick={onNavigate}>Plan &amp; billing</Link>
    </div>
  );
}

function UpgradeCard({ subscription, onNavigate }) {
  const location = useLocation();
  const demoEnds = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  return (
    <div className="upgrade-card">
      <p className="upgrade-card-title">{demoEnds ? `Your ${subscription.source === 'pass' ? 'pass' : 'demo Premium'} ends ${demoEnds}` : "You're on the Free plan"}</p>
      <p>Import your own AI key for free, or upgrade for automated Stripe &amp; Store sync.</p>
      <Link to={`/premium?from=${encodeURIComponent(location.pathname)}`} className="btn btn-primary btn-sm w-full" onClick={onNavigate}>
        {demoEnds ? 'Subscribe' : 'Upgrade to Premium'}
      </Link>
    </div>
  );
}

function Sidebar({ open, onClose, onOpenCommand }) {
  const { user, hasPremium, subscription, signOut } = useAuth();
  const { models } = useImportedAi('default');
  const navigate = useNavigate();
  const demo = hasPremium && subscription?.source === 'demo';
  const pass = hasPremium && subscription?.source === 'pass';
  const planName = !hasPremium ? 'Free plan' : demo ? 'Demo Premium' : pass ? 'Premium pass' : subscription.source === 'admin' ? 'Admin Premium' : 'Premium';
  const firstLink = useRef(null);

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
        <div className="flex-between" style={{ gap: 8 }}>
          <Link to="/" className="app-brand" aria-label="VibeAssist home" onClick={onClose}>
            <BrandMark /> VibeAssist
            {isDesktopApp() && <span className="badge badge--cobalt" style={{ fontSize: 10, padding: '1px 6px' }}>Rust</span>}
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Quick jump (Ctrl+K)"
            aria-label="Quick navigation"
            onClick={() => { onClose(); onOpenCommand(); }}
          >
            <Search aria-hidden="true" style={{ width: 15, height: 15 }} />
            <span className="cmd-kbd">Ctrl+K</span>
          </button>
        </div>

        <nav className="app-nav" ref={firstLink}>
          {FREE_PAGES.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              hasPremium={hasPremium}
              hasByok={models.length > 0}
              aiBadge={models.length ? String(models.length) : ''}
              onNavigate={onClose}
            />
          ))}
          <div className="app-nav-divider" role="separator" />
          {PREMIUM_PAGES.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              hasPremium={hasPremium}
              hasByok={models.length > 0}
              onNavigate={onClose}
            />
          ))}
        </nav>

        {(!hasPremium || demo || pass)
          ? <UpgradeCard subscription={demo || pass ? subscription : null} onNavigate={onClose} />
          : <PremiumActiveCard onNavigate={onClose} />}

        <div className="app-sidebar-footer app-nav">
          <NavLink to="/settings" onClick={onClose}><SettingsIcon aria-hidden="true" /> Settings</NavLink>
          <button type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start', minHeight: 38, fontWeight: 500 }} onClick={handleSignOut}>
            <LogOut aria-hidden="true" /> Sign out
          </button>
          <p className="app-account" title={user?.user_metadata?.role === 'superuser' ? 'test · Superuser (Full Access)' : user?.email}>
            {user?.user_metadata?.role === 'superuser' ? 'test · Superuser (Full Access)' : `${user?.email} · ${planName}`}
          </p>
        </div>
      </aside>
    </>
  );
}

function MainLayout() {
  useAppPreset();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const location = useLocation();
  const toggle = useRef(null);
  const current = ALL_PAGES.find((p) => location.pathname.startsWith(p.to));

  const close = useCallback(() => {
    setMenuOpen((open) => {
      if (open) toggle.current?.focus();
      return false;
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar open={menuOpen} onClose={close} onOpenCommand={() => setCmdOpen(true)} />
      <div className="app-main-wrap">
        <div className="app-topbar">
          <Link to="/" className="app-brand" aria-label="VibeAssist home"><BrandMark /> VibeAssist</Link>
          {current && <span className="app-topbar-title">{current.label}</span>}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            style={{ marginLeft: 'auto' }}
            aria-label="Quick navigation"
            onClick={() => setCmdOpen(true)}
          >
            <Search aria-hidden="true" />
          </button>
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
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location }} />;
  return <MainLayout />;
}

function PremiumRoute({ feature }) {
  const { hasPremium } = useAuth();
  const { models } = useImportedAi('default');
  const byokAllowed = (feature === 'ai-analyzer' || feature === 'plan') && models.length > 0;
  if (!hasPremium && !byokAllowed) return <PremiumGate feature={feature} />;
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
              <Route path="/handoff" element={<Suspense fallback={<FullPageSpinner />}><SharedHandoff /></Suspense>} />

              <Route element={<AuthRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/ai-models" element={<ImportAI />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/publishing" element={<Publishing />} />
                <Route path="/newsletter" element={<Newsletter />} />
                <Route path="/handoffs" element={<Handoffs />} />
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
              </Route>

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
