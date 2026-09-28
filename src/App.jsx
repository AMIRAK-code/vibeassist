import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Code, TrendingUp, Cpu, Newspaper, Megaphone, ShieldAlert, Sparkles } from 'lucide-react';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import PremiumPaywall from './pages/PremiumPaywall';
import Integrations from './pages/Integrations';
import AIAnalyzer from './pages/AIAnalyzer';
import PublishingGuide from './pages/PublishingGuide';
import AdManager from './pages/AdManager';
import Newsletter from './pages/Newsletter';

function Sidebar() {
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
        <Link to="/dashboard" className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}>
          <LayoutDashboard size={20} /> Dashboard
        </Link>
        <Link to="/integrations" className={`nav-item ${isActive('/integrations') ? 'active' : ''}`}>
          <TrendingUp size={20} /> Integrations & Sales
        </Link>
        <Link to="/ai-analyzer" className={`nav-item ${isActive('/ai-analyzer') ? 'active' : ''}`}>
          <Cpu size={20} /> AI Business Analyzer
        </Link>
        <Link to="/publishing" className={`nav-item ${isActive('/publishing') ? 'active' : ''}`}>
          <ShieldAlert size={20} /> Publishing & Legal
        </Link>
        <Link to="/ads" className={`nav-item ${isActive('/ads') ? 'active' : ''}`}>
          <Megaphone size={20} /> Ad Manager
        </Link>
        <Link to="/newsletter" className={`nav-item ${isActive('/newsletter') ? 'active' : ''}`}>
          <Newspaper size={20} /> News & Newsletter
        </Link>
      </nav>

      <div style={{ marginTop: 'auto' }}>
        <div className="glass-panel" style={{ padding: '16px', textAlign: 'center', borderColor: 'var(--accent-1)' }}>
          <Sparkles className="text-gradient" size={24} style={{ margin: '0 auto 8px' }} />
          <h4 style={{ marginBottom: '4px' }}>Premium Active</h4>
          <p className="input-label" style={{ fontSize: '0.8rem' }}>All pro features unlocked</p>
        </div>
      </div>
    </div>
  );
}

function MainLayout({ children }) {
  return (
    <div className="app-container animate-fade-in">
      <Sidebar />
      <div className="main-content">
        {children}
      </div>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPremium, setHasPremium] = useState(false);

  // Auth guard wrapper
  const ProtectedRoute = ({ children }) => {
    if (!isAuthenticated || !hasPremium) {
      return <Navigate to="/onboarding" />;
    }
    return <MainLayout>{children}</MainLayout>;
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
            <PremiumPaywall onSubscribe={() => setHasPremium(true)} /> : 
            <Navigate to="/onboarding" />
          } 
        />

        {/* Protected Dashboard Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
        <Route path="/ai-analyzer" element={<ProtectedRoute><AIAnalyzer /></ProtectedRoute>} />
        <Route path="/publishing" element={<ProtectedRoute><PublishingGuide /></ProtectedRoute>} />
        <Route path="/ads" element={<ProtectedRoute><AdManager /></ProtectedRoute>} />
        <Route path="/newsletter" element={<ProtectedRoute><Newsletter /></ProtectedRoute>} />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
