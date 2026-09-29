import { Link } from "react-router-dom";
import { Plug, Check } from "lucide-react";
import { PageHeader, Notice } from "../components/UI";
import { sources } from "../data/project";

export default function Integrations({ project, onUpdateProject }) {
  return (
    <div className="stack">
      <PageHeader
        title="Connections"
        description="Choose where your project’s data will come from."
      >
        <span className="badge">0 sources connected</span>
      </PageHeader>
      <Notice>
        <strong>Live integrations are not available in this preview.</strong>
        <p>
          You can save a preferred source. No credentials are requested and no
          data is imported.
        </p>
      </Notice>
      <div className="grid-3">
        {sources.map((source) => (
          <section className="glass-panel connection-card" key={source.id}>
            <Plug size={24} aria-hidden="true" />
            <h2>{source.name}</h2>
            <p className="muted">{source.description}</p>
            <span className="badge">Not connected</span>
            <button
              className="btn btn-secondary"
              aria-pressed={project?.source === source.id}
              onClick={() =>
                onUpdateProject({
                  ...project,
                  source: project?.source === source.id ? "" : source.id,
                })
              }
            >
              {project?.source === source.id ? (
                <>
                  <Check size={16} aria-hidden="true" />
                  Preferred source
                </>
              ) : (
                "Set as preferred source"
              )}
            </button>
          </section>
        ))}
      </div>
      <p className="muted" role="status">
        {project?.source
          ? `${sources.find((source) => source.id === project.source)?.name} is your preferred source. Select it again to clear this preference.`
          : "No preferred source selected."}
      </p>
      <div className="glass-panel next-action">
        <div>
          <h2>Keep exploring in the meantime.</h2>
          <p className="muted">
            Use a clearly labeled sample dataset to see how your overview works.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => onUpdateProject({ ...project, mode: "sample" })}
        >
          Use sample data
        </button>
        <Link className="btn btn-secondary" to="/dashboard">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
