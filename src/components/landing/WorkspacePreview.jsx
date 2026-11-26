import React, { useState } from 'react';
import {
  LayoutDashboard, Plug, Megaphone, PenLine, Plus, Search, ListChecks, BarChart3, StickyNote,
  ChevronDown, TrendingUp, Download, RefreshCw, MoreHorizontal, ShieldCheck, Cpu,
} from 'lucide-react';
import BrandMark from './BrandMark';

const SIDEBAR = [
  { id: 'plan', icon: LayoutDashboard, label: 'Overall Income' },
  { id: 'numbers', icon: Plug, label: 'Connections & CSV' },
  { id: 'ads', icon: Megaphone, label: 'Ad Manager' },
  { id: 'security', icon: ShieldCheck, label: 'Legal & Security' },
];

const TABS = [
  { id: 'plan', icon: ListChecks, label: 'Plan', action: 'Write a plan' },
  { id: 'numbers', icon: BarChart3, label: 'Numbers', action: 'Sync sources' },
  { id: 'ads', icon: Megaphone, label: 'Ads', action: 'Check ROAS' },
  { id: 'security', icon: ShieldCheck, label: 'AI & Security', action: 'Run audit' },
];

const VIEWS = {
  plan: {
    heading: 'This week’s plan',
    items: [
      { title: 'A clearer view of revenue', text: 'Stripe, your apps and manual entries, side by side.' },
      { title: 'Turning numbers into steps', text: 'Advice grounded in your own metrics.', highlight: true },
      { title: 'A calmer launch', text: 'Store, legal and security checks before you ship.' },
    ],
    notesTitle: 'Notes',
    notes: [
      'Ads pay off above 100% ROAS.',
      'Connect Stripe for real revenue.',
      'Check prices with the advisor.',
    ],
  },
  numbers: {
    heading: '30-day ledger',
    items: [
      { title: '$14,820 gross · $11,940 net profit', text: '+24.6% vs prior 30 days after fees and ad spend.', highlight: true },
      { title: 'Stripe · App Store · Google Play', text: 'Synced 90 days cleanly with automatic currency conversion.' },
      { title: '1,420 downloads · 4.8% conversion', text: 'LTV : CAC sits at 4.2 : 1 with 3.1 month payback.' },
    ],
    notesTitle: 'Sources',
    notes: [
      'Stripe (rk_live): read-only balance.',
      'App Store Connect: .p8 team key.',
      'CSV import: manual fallback ready.',
    ],
  },
  ads: {
    heading: 'Campaign ROAS',
    items: [
      { title: 'Apple Search Ads · 310% ROAS', text: '$420 spend → $1,302 revenue · $1.18 per install.', highlight: true },
      { title: 'Meta Retargeting · 245% ROAS', text: '$680 spend → $1,666 revenue · active & scaling.' },
      { title: 'TikTok Launch · 74% ROAS (Paused)', text: 'Flagged below break-even; budget moved to Search.' },
    ],
    notesTitle: 'Signals',
    notes: [
      'Break-even ROAS target: 118%.',
      'Blended CAC: $1.62 vs $2.50 cap.',
      'CSV report sync ready for Meta & Google.',
    ],
  },
  security: {
    heading: 'BYOK & Guardrails',
    items: [
      { title: 'Gemini 2.5 Pro + Ollama Local', text: 'Route heavy reasoning to cloud, chats to localhost.', highlight: true },
      { title: '0 secret leaks · 0 high CVEs', text: 'Client-side regex & live OSV.dev dependency scan.' },
      { title: 'PrivacyInfo.xcprivacy & GDPR DPA', text: '7 legal docs + store manifests ready to export.' },
    ],
    notesTitle: 'Posture',
    notes: [
      'Browser-direct AI key storage.',
      'Read-only GitHub PAT enforced.',
      'EU Frankfurt DB with strict RLS.',
    ],
  },
};

export default function WorkspacePreview({ id }) {
  const [tab, setTab] = useState('plan');
  const activeView = VIEWS[tab] ?? VIEWS.plan;
  const activeTabMeta = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <figure className="ci-ws" id={id}>
      <div className="ci-ws-frame" aria-label="Interactive VibeAssist workspace preview">
        <div className="ci-ws-dots" aria-hidden="true"><span /><span /><span /></div>

        <div className="ci-ws-screen">
          <div className="ci-ws-side" aria-hidden="true">
            <div className="ci-ws-brand"><BrandMark className="ci-ws-brand-mark" /> VibeAssist</div>
            <ul className="ci-ws-nav">
              {SIDEBAR.map(({ id: itemId, icon: Icon, label }) => (
                <li key={label} className={tab === itemId ? 'is-active' : undefined}>
                  <Icon /> <span>{label}</span>
                </li>
              ))}
            </ul>
            <div className="ci-ws-side-rule" />
            <div className="ci-ws-add"><Cpu /> Import AI</div>
          </div>

          <div className="ci-ws-main">
            <div className="ci-ws-top" aria-hidden="true">
              <span className="ci-ws-title">Your workspace</span>
              <Search className="ci-ws-search" />
              <span className="ci-ws-avatar">V</span>
            </div>

            <div className="ci-ws-tabs" role="tablist" aria-label="Workspace preview views">
              {TABS.map(({ id: tabId, icon: Icon, label }, index) => (
                <React.Fragment key={tabId}>
                  {index === 2 && <span className="ci-ws-tab-rule" aria-hidden="true" />}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === tabId}
                    className={`ci-ws-tab${tab === tabId ? ' is-active' : ''}`}
                    onClick={() => setTab(tabId)}
                  >
                    <Icon aria-hidden="true" /> <span>{label}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>

            <div className="ci-ws-body" role="tabpanel" aria-label={activeView.heading}>
              <div className="ci-ws-doc">
                <p className="ci-ws-heading">{activeView.heading}</p>
                <ol className="ci-ws-steps">
                  {activeView.items.map((step, index) => (
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
                <p className="ci-ws-notes-title"><StickyNote aria-hidden="true" /> {activeView.notesTitle}</p>
                {activeView.notes.map((note) => <p key={note} className="ci-ws-note">{note}</p>)}
              </div>
            </div>

            <div className="ci-ws-toolbar" aria-hidden="true">
              <span className="ci-ws-period">Last 30 days <ChevronDown /></span>
              <span className="ci-ws-tool-rule" />
              <span className="ci-ws-tool"><TrendingUp /></span>
              <span className="ci-ws-tool"><Download /></span>
              <span className="ci-ws-tool"><Plug /></span>
              <span className="ci-ws-tool-rule" />
              <span className="ci-ws-tool"><RefreshCw /></span>
              <span className="ci-ws-tool"><Plus /></span>
              <span className="ci-ws-tool-rule ci-ws-tool-rule--action" />
              <span className="ci-ws-action"><PenLine /> {activeTabMeta.action}</span>
              <span className="ci-ws-tool ci-ws-more"><MoreHorizontal /></span>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="ci-ws-caption">Illustrative workspace · select tabs to inspect views</figcaption>
    </figure>
  );
}
