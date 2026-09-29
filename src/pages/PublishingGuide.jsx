import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { PageHeader, Notice } from "../components/UI";

const guides = [
  {
    id: "ios",
    name: "iOS & App Store",
    url: "https://developer.apple.com/app-store/review/guidelines/",
    steps: [
      "Review the App Store guidelines for your app category.",
      "Prepare your privacy disclosures and required app information.",
      "Check purchase flows and test the build before submission.",
    ],
  },
  {
    id: "android",
    name: "Android & Google Play",
    url: "https://support.google.com/googleplay/android-developer/answer/9859152",
    steps: [
      "Review the policies that apply to your app.",
      "Check the testing requirements for your developer account.",
      "Prepare your store listing and Data safety information.",
    ],
  },
  {
    id: "windows",
    name: "Windows",
    url: "https://learn.microsoft.com/en-us/windows/apps/publish/",
    steps: [
      "Choose your distribution and packaging approach.",
      "Review signing and certification requirements.",
      "Test installation, updates, and removal before publishing.",
    ],
  },
  {
    id: "web",
    name: "Web / SaaS",
    url: "https://web.dev/learn/",
    steps: [
      "Test core journeys on mobile and with a keyboard.",
      "Review data collection and required privacy disclosures for your audience.",
      "Test payment, recovery, and support flows before launch.",
    ],
  },
];
export default function PublishingGuide({ project }) {
  const [platform, setPlatform] = useState(
    () =>
      ({
        iOS: "ios",
        Android: "android",
        Desktop: "windows",
        "Web / SaaS": "web",
      })[project?.platform] || "all",
  );
  return (
    <div className="stack">
      <PageHeader
        title="Launch checklist"
        description="Start with your platform, then review the guidance that applies to your project."
      />
      <Notice>
        These are planning prompts, not a compliance certification. Requirements
        vary by app, account, and location. Follow the linked official
        documentation for current details.
      </Notice>
      <div className="input-group platform-select">
        <label htmlFor="launch-platform">Platform</label>
        <select
          id="launch-platform"
          className="input-field"
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
        >
          <option value="all">All platforms</option>
          {guides.map((guide) => (
            <option value={guide.id} key={guide.id}>
              {guide.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid-2">
        {guides
          .filter((guide) => platform === "all" || guide.id === platform)
          .map((guide) => (
            <section className="glass-panel resource-card" key={guide.id}>
              <h2>{guide.name}</h2>
              <ol className="launch-steps">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <a href={guide.url} target="_blank" rel="noreferrer">
                Read official guidance{" "}
                <ExternalLink size={16} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </section>
          ))}
      </div>
      <section className="glass-panel">
        <h2>Legal documents</h2>
        <p className="muted mt-4">
          Document generation is not available in this preview. Prepare your
          data practices and business details before seeking guidance
          appropriate to your project and location.
        </p>
      </section>
    </div>
  );
}
