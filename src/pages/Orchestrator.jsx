import { useState } from "react";
import { PageHeader, Notice } from "../components/UI";
const modules = [
  {
    id: "review",
    title: "Code review",
    description: "Review security and architecture findings before release.",
  },
  {
    id: "checks",
    title: "Pre-launch checks",
    description: "Check common configuration and release issues.",
  },
  {
    id: "context",
    title: "Project context",
    description: "Keep project decisions and implementation aligned.",
  },
  {
    id: "tests",
    title: "Test quality",
    description: "Understand whether tests catch meaningful changes.",
  },
  {
    id: "visual",
    title: "Visual checks",
    description: "Review layout changes across screen sizes.",
  },
  {
    id: "history",
    title: "Change history",
    description: "Inspect checkpoints and plan recovery from unwanted changes.",
  },
  {
    id: "routing",
    title: "Model routing",
    description: "Manage model availability and request routing.",
  },
];
export default function Orchestrator() {
  const [selected, setSelected] = useState("review");
  const current = modules.find((module) => module.id === selected);
  return (
    <div className="stack">
      <PageHeader
        title="Developer tools"
        description="An early look at possible tools for checking your app before release."
      />
      <Notice>
        <strong>These tools are planned, not running.</strong>
        <p>
          No repository is connected, no code is scanned, and no background
          agents are active.
        </p>
      </Notice>
      <div className="grid-2">
        <div
          className="glass-panel stack"
          role="group"
          aria-label="Tool previews"
        >
          {modules.map((module) => (
            <button
              className={`tool-option${selected === module.id ? " selected" : ""}`}
              aria-pressed={selected === module.id}
              onClick={() => setSelected(module.id)}
              key={module.id}
            >
              {module.title}
            </button>
          ))}
        </div>
        <section className="glass-panel resource-card" aria-live="polite">
          <span className="badge">Planned capability</span>
          <h2>{current.title}</h2>
          <p>{current.description}</p>
          <p>
            There are no results to display. This preview explains the intended
            use of the tool without simulating a scan.
          </p>
        </section>
      </div>
    </div>
  );
}
