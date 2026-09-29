import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import PremiumPaywall from './pages/PremiumPaywall';
import Integrations from './pages/Integrations';
import AIAnalyzer from './pages/AIAnalyzer';
import PublishingGuide from './pages/PublishingGuide';
import AdManager from './pages/AdManager';
import Newsletter from './pages/Newsletter';
import Orchestrator from './pages/Orchestrator';

function PremiumGate({ hasPremium }) {
  return hasPremium ? <Outlet /> : <Navigate to="/premium" replace />;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPremium, setHasPremium] = useState(false);
  return <BrowserRouter><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/onboarding" element={<Onboarding onComplete={() => setIsAuthenticated(true)} />} />
    <Route path="/premium" element={isAuthenticated ? <PremiumPaywall onSubscribe={() => setHasPremium(true)} onSkip={() => {}} /> : <Navigate to="/onboarding" replace />} />
    <Route element={isAuthenticated ? <AppLayout hasPremium={hasPremium} /> : <Navigate to="/onboarding" replace />}>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/publishing" element={<PublishingGuide />} />
      <Route path="/newsletter" element={<Newsletter />} />
      <Route element={<PremiumGate hasPremium={hasPremium} />}>
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/ai-analyzer" element={<AIAnalyzer />} />
        <Route path="/ads" element={<AdManager />} />
        <Route path="/orchestrator" element={<Orchestrator />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter>;
}
