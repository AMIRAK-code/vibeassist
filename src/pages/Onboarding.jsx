import { useEffect, useReducer, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Code, Check, Plug } from "lucide-react";
import { Notice } from "../components/UI";
import {
  platforms,
  sources,
  createProject,
  onboardingReducer,
  validateProject,
} from "../data/project";

export default function Onboarding({ onComplete, project }) {
  const [params] = useSearchParams();
  const [state, dispatch] = useReducer(onboardingReducer, {
    step: 1,
    error: "",
    draft: {
      name:
        project?.name || (params.get("demo") === "1" ? "Sample project" : ""),
      platform: project?.platform || "Web / SaaS",
      source: project?.source || "",
    },
  });
  const headingRef = useRef(null);
  const nameRef = useRef(null);
  const navigate = useNavigate();
  const { step, draft, error } = state;
  useEffect(() => {
    document.title = `Project setup · Step ${step} · VibeAssist`;
    headingRef.current?.focus();
  }, [step]);
  const change = (field, value) => dispatch({ type: "change", field, value });
  function next(event) {
    event.preventDefault();
    dispatch({ type: "next" });
    if (validateProject(draft)) nameRef.current?.focus();
  }
  function finish(mode) {
    onComplete(createProject(draft, mode));
    navigate("/dashboard");
  }
  return (
    <main className="setup-page">
      <Link className="brand" to="/">
        <Code aria-hidden="true" />
        VibeAssist
      </Link>
      <section className="setup-panel glass-panel">
        <ol className="setup-progress" aria-label="Project setup progress">
          <li aria-current={step === 1 ? "step" : undefined}>
            <span>
              {step > 1 ? <Check size={16} aria-label="Complete" /> : "1"}
            </span>
            Project
          </li>
          <li aria-current={step === 2 ? "step" : undefined}>
            <span>2</span>Data source
          </li>
        </ol>
        <span className="eyebrow">Step {step} of 2</span>
        <h1 ref={headingRef} tabIndex={-1}>
          {step === 1 ? "Start with your project." : "Choose where to begin."}
        </h1>
        <p className="muted setup-intro">
          {step === 1
            ? "A name and a platform are all you need. You can change them later."
            : "Save a preferred source for later, or explore the overview with sample data today."}
        </p>
        {step === 1 ? (
          <form onSubmit={next} noValidate>
            <div className="input-group">
              <label htmlFor="project-name">Project name</label>
              <input
                ref={nameRef}
                id="project-name"
                className="input-field"
                value={draft.name}
                onChange={(event) => change("name", event.target.value)}
                placeholder="e.g. My next app"
                maxLength={80}
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "project-error" : "project-name-help"}
                autoComplete="off"
              />
              <span id="project-name-help" className="muted">
                Up to 80 characters. Saved only in this browser.
              </span>
              {error && (
                <p id="project-error" className="error-text" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="input-group">
              <label htmlFor="project-platform">Platform</label>
              <select
                id="project-platform"
                className="input-field"
                value={draft.platform}
                onChange={(event) => change("platform", event.target.value)}
              >
                {platforms.map((platform) => (
                  <option key={platform}>{platform}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary w-full" type="submit">
              Choose a data source <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button
              className="btn btn-secondary w-full mt-4"
              type="button"
              onClick={() => finish("sample")}
            >
              Explore with sample data
            </button>
          </form>
        ) : (
          <div className="stack">
            <Notice>
              <strong>Live connections are not available yet.</strong>
              <p>
                Selecting a source saves your preference. It does not authorize
                an account or import data.
              </p>
            </Notice>
            <fieldset className="source-options">
              <legend>
                Preferred data source <span className="muted">(optional)</span>
              </legend>
              {[
                ...sources,
                {
                  id: "",
                  name: "Decide later",
                  description: "You can choose a source from Connections.",
                },
              ].map((source) => (
                <label
                  className={`source-option${draft.source === source.id ? " selected" : ""}`}
                  key={source.id || "none"}
                >
                  <input
                    type="radio"
                    name="source"
                    value={source.id}
                    checked={draft.source === source.id}
                    onChange={() => change("source", source.id)}
                  />
                  <span>
                    <strong>{source.name}</strong>
                    <small>{source.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="setup-completion">
              <button
                className="btn btn-primary"
                onClick={() => finish("sample")}
              >
                Explore with sample data{" "}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => finish("empty")}
              >
                {draft.source
                  ? "Save preference & open overview"
                  : "Skip for now"}
              </button>
            </div>
            {draft.source && (
              <button className="text-button" onClick={() => finish("empty")}>
                Skip for now
              </button>
            )}
            <button
              className="btn btn-secondary setup-back"
              onClick={() => dispatch({ type: "back" })}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back to project
            </button>
          </div>
        )}
        <p className="setup-footnote">
          <Plug size={16} aria-hidden="true" />
          This is a local workspace, not account creation. No password or
          payment needed.
        </p>
      </section>
    </main>
  );
}
