import React from 'react';
import {
  LayoutDashboard, Plug, Megaphone, Sparkles, Plus, Search, ListChecks, BarChart3, StickyNote,
  ChevronDown, TrendingUp, Download, RefreshCw, MoreHorizontal,
} from 'lucide-react';
import BrandMark from './BrandMark';

// Static illustration of the product, built in HTML/CSS. Every label names a real
// VibeAssist area, but nothing in here is interactive, so it is exposed to assistive
// technology as a single image with a description.
const SIDEBAR = [
  { icon: LayoutDashboard, label: 'Overview', active: true },
  { icon: Plug, label: 'Integrations' },
  { icon: Megaphone, label: 'Ad Manager' },
  { icon: Sparkles, label: 'AI Advisor' },
];

const TABS = [
  { icon: ListChecks, label: 'Plan', active: true },
  { icon: BarChart3, label: 'Numbers' },
  { icon: Megaphone, label: 'Ads' },
];

const STEPS = [
  { title: 'A clearer view of revenue', text: 'Stripe, your apps and manual entries, side by side.' },
  { title: 'Turning numbers into steps', text: 'Advice grounded in your own metrics.', highlight: true },
  { title: 'A calmer launch', text: 'Store and legal guidance for every platform you ship to.' },
];

const NOTES = [
  'Ads pay off above 100% ROAS.',
  'Connect Stripe for real revenue.',
  'Check prices with the advisor.',
];

const DESCRIPTION =
  'Illustration of the VibeAssist workspace: a sidebar with Overview, Integrations, Ad Manager and AI Advisor, ' +
  "and this week's plan with three next steps drawn from your revenue, ads and launch guidance.";

export default function WorkspacePreview({ id }) {
  return (
    <figure className="ci-ws" id={id}>
      <div className="ci-ws-frame" role="img" aria-label={DESCRIPTION}>
        <div className="ci-ws-dots" aria-hidden="true"><span /><span /><span /></div>

        <div className="ci-ws-screen" aria-hidden="true">
          <div className="ci-ws-side">
            <div className="ci-ws-brand"><BrandMark className="ci-ws-brand-mark" /> VibeAssist</div>
            <ul className="ci-ws-nav">
              {SIDEBAR.map(({ icon: Icon, label, active }) => (
                <li key={label} className={active ? 'is-active' : undefined}><Icon /> {label}</li>
              ))}
            </ul>
            <div className="ci-ws-side-rule" />
            <div className="ci-ws-add"><Plus /> Add data</div>
          </div>

          <div className="ci-ws-main">
            <div className="ci-ws-top">
              <span className="ci-ws-title">Your workspace</span>
              <Search className="ci-ws-search" />
              <span className="ci-ws-avatar">S</span>
            </div>

            <div className="ci-ws-tabs">
              {TABS.map(({ icon: Icon, label, active }, index) => (
                <React.Fragment key={label}>
                  {index === 2 && <span className="ci-ws-tab-rule" />}
                  <span className={`ci-ws-tab${active ? ' is-active' : ''}`}><Icon /> {label}</span>
                </React.Fragment>
              ))}
            </div>

            <div className="ci-ws-body">
              <div className="ci-ws-doc">
                <p className="ci-ws-heading">This week’s plan</p>
                <ol className="ci-ws-steps">
                  {STEPS.map((step, index) => (
                    <li key={step.title}>
                      <span className="ci-ws-step-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="ci-ws-step-copy">
                        <span className={`ci-ws-step-title${step.highlight ? ' is-highlighted' : ''}`}>{step.title}</span>
                        <span className="ci-ws-step-text">{step.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="ci-ws-notes">
                <p className="ci-ws-notes-title"><StickyNote /> Notes</p>
                {NOTES.map((note) => <p key={note} className="ci-ws-note">{note}</p>)}
              </div>
            </div>

            <div className="ci-ws-toolbar">
              <span className="ci-ws-period">Last 30 days <ChevronDown /></span>
              <span className="ci-ws-tool-rule" />
              <span className="ci-ws-tool"><TrendingUp /></span>
              <span className="ci-ws-tool"><Download /></span>
              <span className="ci-ws-tool"><Plug /></span>
              <span className="ci-ws-tool-rule" />
              <span className="ci-ws-tool"><RefreshCw /></span>
              <span className="ci-ws-tool"><Plus /></span>
              <span className="ci-ws-tool-rule ci-ws-tool-rule--action" />
              <span className="ci-ws-action"><Sparkles /> Ask the advisor</span>
              <span className="ci-ws-tool ci-ws-more"><MoreHorizontal /></span>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="ci-ws-caption">Illustrative workspace</figcaption>
    </figure>
  );
}
