import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Code } from "lucide-react";
import { Notice } from "../components/UI";
export default function PremiumPaywall() {
  useEffect(() => {
    document.title = "About the preview · VibeAssist";
  }, []);
  return (
    <main className="setup-page">
      <Link className="brand" to="/">
        <Code aria-hidden="true" />
        VibeAssist
      </Link>
      <section className="glass-panel stack">
        <h1>Explore the preview.</h1>
        <Notice>
          No payment or subscription is required. Checkout and paid plans are
          not available yet.
        </Notice>
        <p>
          Your workspace is saved in this browser. You can set up a project,
          explore sample metrics, choose a preferred data source, and review
          launch resources.
        </p>
        <p className="muted">
          Live integrations, personalized AI analysis, campaign management, and
          developer automation are not active services in this preview.
        </p>
        <Link to="/dashboard" className="btn btn-primary">
          Return to workspace
        </Link>
      </section>
    </main>
  );
}
