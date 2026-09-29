import { Link } from "react-router-dom";
import { ArrowRight, Plug, ListChecks, BarChart3 } from "lucide-react";
import { PageHeader, Notice } from "../components/UI";

export default function AIAnalyzer() {
  return (
    <div className="stack">
      <PageHeader
        title="Recommendations"
        description="A practical place to decide what to work on next."
      />
      <Notice>
        <strong>Personalized AI analysis is not available yet.</strong>
        <p>
          The starting points below are general planning guidance, not forecasts
          or recommendations generated from your project’s data.
        </p>
      </Notice>
      <div className="grid-3">
        {[
          {
            icon: Plug,
            title: "Choose your source",
            text: "Decide which provider holds the most useful information for your project. Save a preference for when live connections are available.",
            to: "/integrations",
            action: "Review connections",
          },
          {
            icon: BarChart3,
            title: "Learn your baseline",
            text: "Explore revenue and downloads separately. Check the period and units before comparing performance.",
            to: "/dashboard",
            action: "Open overview",
          },
          {
            icon: ListChecks,
            title: "Plan your launch",
            text: "Review the official guidance for your platform, then identify the work your project still needs.",
            to: "/publishing",
            action: "Open launch checklist",
          },
        ].map(({ icon: Icon, title, text, to, action }) => (
          <article className="glass-panel resource-card" key={to}>
            <Icon size={24} aria-hidden="true" />
            <h2>{title}</h2>
            <p>{text}</p>
            <Link to={to}>
              {action}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
