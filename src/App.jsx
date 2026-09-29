import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import { PROJECT_KEY, readProject } from "./data/project";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import PremiumPaywall from "./pages/PremiumPaywall";
import Integrations from "./pages/Integrations";
import AIAnalyzer from "./pages/AIAnalyzer";
import PublishingGuide from "./pages/PublishingGuide";
import CampaignOverview from "./pages/CampaignOverview";
import Newsletter from "./pages/Newsletter";
import Orchestrator from "./pages/Orchestrator";
const Dashboard = lazy(() => import("./pages/Dashboard"));

export default function App() {
  const [project, setProject] = useState(() => {
    try {
      return readProject(window.localStorage);
    } catch {
      return null;
    }
  });
  const [storageError, setStorageError] = useState(false);
  function saveProject(next) {
    setProject(next);
    try {
      localStorage.setItem(PROJECT_KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  return (
    <BrowserRouter>
      {storageError && (
        <p className="storage-notice" role="alert">
          Browser storage is unavailable. Your changes work for this visit, but
          will not survive a reload.
        </p>
      )}
      <Routes>
        <Route path="/" element={<Landing hasProject={Boolean(project)} />} />
        <Route
          path="/onboarding"
          element={<Onboarding project={project} onComplete={saveProject} />}
        />
        <Route path="/premium" element={<PremiumPaywall />} />
        <Route
          element={
            project ? (
              <AppLayout project={project} />
            ) : (
              <Navigate to="/onboarding" replace />
            )
          }
        >
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<p role="status">Loading overview…</p>}>
                <Dashboard
                  project={project}
                  onExploreSample={() =>
                    saveProject({ ...project, mode: "sample" })
                  }
                />
              </Suspense>
            }
          />
          <Route
            path="/integrations"
            element={
              <Integrations project={project} onUpdateProject={saveProject} />
            }
          />
          <Route path="/ai-analyzer" element={<AIAnalyzer />} />
          <Route
            path="/publishing"
            element={<PublishingGuide project={project} />}
          />
          <Route path="/newsletter" element={<Newsletter />} />
          <Route path="/ads" element={<CampaignOverview />} />
          <Route path="/orchestrator" element={<Orchestrator />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
