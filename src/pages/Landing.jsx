import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowRightLeft, Check, ChevronRight, Cpu, FileCheck2,
  HardDrive, KeyRound, Lock, Menu, Plug, ShieldCheck, TrendingUp, X,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import BrandMark from '../components/landing/BrandMark';
import WorkspacePreview from '../components/landing/WorkspacePreview';
import sculpture from '../assets/landing/clay-sculpture.webp';
import '../styles/tokens.css';
import './Landing.css';
import LegalLinks from '../components/LegalLinks';
import { BUSINESS } from '../lib/business';

const SPAN_STRIP = [
  { num: '01', title: 'Unified Income & Ads', desc: 'Stripe, App Store, Google Play, CSV and ROAS side by side.' },
  { num: '02', title: 'Import Your AI', desc: 'Bring Gemini, Claude, OpenAI, or local Ollama & LM Studio.' },
  { num: '03', title: 'Legal & Security Lab', desc: '7 legal templates, PrivacyInfo.xcprivacy, CVE & secret scans.' },
  { num: '04', title: 'Context Handoffs', desc: 'Clean, secret-redacted briefings portable between any AI.' },
];

const AI_SHOWCASE = [
  {
    tag: 'Cloud API',
    name: 'Google Gemini',
    models: 'gemini-2.5-pro · gemini-2.5-flash',
    note: 'Direct browser-to-Google connection with your AI Studio key and zero markup.',
  },
  {
    tag: 'Cloud API',
    name: 'Anthropic Claude',
    models: 'claude-sonnet-4-5 · claude-opus-4-5',
    note: 'Precision drafting for legal policies, weekly plans and red-team code audits.',
  },
  {
    tag: 'Cloud API',
    name: 'OpenAI & Routers',
    models: 'gpt-4.1 · o4-mini · OpenRouter · Groq · DeepSeek',
    note: 'Connect OpenAI or multi-model routers with automatic Gateway fallbacks.',
  },
  {
    tag: '100% Local',
    name: 'Ollama & LM Studio',
    models: 'localhost:11434 · localhost:1234 · vLLM',
    note: 'Keep chats, code and metrics completely on your own hardware with one-click model detection.',
    highlight: true,
  },
];

const FREE_FEATURES = [
  'Overall Income dashboard, goal pacing & CSV export',
  'Import Your AI: connect Gemini, Claude, OpenAI & local Ollama',
  'Universal CSV importer & Custom API metrics endpoint',
  'Legal & Security Lab: 7 legal templates, secret & OSV CVE scans',
  'Apple PrivacyInfo.xcprivacy & Google Play Data Safety builders',
  'Context Handoffs & Weekly Vibe indie developer newsletter',
];

const PREMIUM_FEATURES = [
  'Automated 90-day sync for Stripe, App Store Connect & Google Play',
  'VibeAssist Cloud AI pool (30 daily advisor & analyzer requests)',
  'Ad Manager with CSV imports for Meta, Google, TikTok, X & Apple Search Ads',
  'Anti-Fragile Engine: GitHub Red Team, Drift Watch & GitHub Actions',
  'Smart Token Gateway with multi-provider fallback routes & Unlimited Handoffs',
];

const FAQ_ITEMS = [
  {
    q: 'Do I have to pay for Premium to use my own Gemini, Claude, OpenAI, or Ollama key?',
    a: 'No. Every signed-in account can open Import Your AI for free, connect cloud API keys or local Ollama / LM Studio servers, and run the AI Business Analyzer, Weekly Plan, Legal Studio, Security Reviews, and Context Handoffs directly from the browser.',
  },
  {
    q: 'How do you keep my Stripe, App Store, and AI API keys safe?',
    a: 'Your BYOK browser keys stay in your own browser storage (or session-only memory) and talk directly to your chosen provider or localhost. Server-synced Stripe and GitHub tokens are strictly read-only (rk_live_ and fine-grained github_pat_) and stored encrypted in Supabase Vault.',
  },
  {
    q: 'What does the Legal & Security Center generate without a lawyer?',
    a: 'You get structured, editable drafts for Privacy Policies, Terms, EULAs, Cookie Policies, DPAs, AI Transparency Notices, and Refund Policies—plus Apple PrivacyInfo.xcprivacy XML, Google Play Data Safety tables, secret-pattern scanning, and live OSV.dev dependency checks. Drafts highlight remaining [placeholders] for you and counsel to review before publishing.',
  },
  {
    q: 'Can I import historical data if I do not connect Stripe or the App Store yet?',
    a: 'Yes. Use the Universal CSV Importer in Connections & Data, push daily rows through your Custom API endpoint, add entries manually, or load 60 days of clearly marked sample data on Overall Income.',
  },
];

function SiteHeader({ exploreTo, signedIn }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    const onClick = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);
  const links = (
    <>
      <a href="#capabilities" onClick={close}>Capabilities</a>
      <a href="#ai-models" onClick={close}>Import AI</a>
      <a href="#security-legal" onClick={close}>Legal &amp; Security</a>
      <a href="#pricing" onClick={close}>Pricing</a>
      {signedIn ? <Link to="/dashboard" onClick={close}>Dashboard</Link> : <Link to="/signin" onClick={close}>Sign in</Link>}
    </>
  );

  return (
    <header className="ci-header">
      <Link to="/" className="ci-brand" aria-label="VibeAssist home">
        <BrandMark className="ci-brand-mark" />
        <span className="ci-brand-word">VibeAssist</span>
      </Link>

      <nav className="ci-nav" aria-label="Main">
        <div className="ci-nav-links">{links}</div>
        <Link to={exploreTo} className="ci-button ci-button--compact">
          {signedIn ? 'Open app' : 'Explore'}
        </Link>
        <div className="ci-menu" ref={menuRef}>
          <button
            type="button"
            className="ci-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span className="ci-visually-hidden">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          </button>
          <div id={menuId} className="ci-menu-panel" hidden={!menuOpen}>
            {links}
            <Link to={exploreTo} className="ci-menu-explore" onClick={close}>Explore the workspace</Link>
          </div>
        </div>
      </nav>
    </header>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [cycle, setCycle] = useState('monthly');
  const exploreTo = user ? '/dashboard' : '/onboarding';
  const aiImportTo = user ? '/ai-models' : '/onboarding';
  const securityTo = user ? '/publishing?tab=security' : '/onboarding';

  return (
    <div className="ci-page">
      <div className="ci-shell">
        <SiteHeader exploreTo={exploreTo} signedIn={Boolean(user)} />

        <main>
          <section className="ci-hero" aria-labelledby="hero-title">
            <div className="ci-hero-copy">
              <p className="ci-eyebrow">For indie app makers &amp; AI builders</p>
              <h1 id="hero-title" className="ci-display">
                <span>Less friction<span className="ci-stop">.</span></span>{' '}
                <span>More <span className="ci-accent-word">clarity</span><span className="ci-stop">.</span></span>
              </h1>
              <p className="ci-lede">
                See what your apps earn, plug in <span className="ci-inline-span">Gemini, Claude, OpenAI, or local Ollama</span>, and harden your legal &amp; security posture before launch.
              </p>
              <div className="ci-actions">
                <Link to={exploreTo} className="ci-button ci-button--primary">
                  {user ? 'Open your workspace' : 'Explore the workspace'} <ArrowRight aria-hidden="true" />
                </Link>
                <a href="#ai-models" className="ci-text-link">
                  See Bring-Your-Own-AI <ChevronRight aria-hidden="true" />
                </a>
              </div>
            </div>
            <WorkspacePreview id="product" />
          </section>

          <hr className="ci-rule" />

          <section className="ci-span-strip" aria-label="Platform capabilities overview">
            {SPAN_STRIP.map((item) => (
              <div key={item.num} className="ci-span-cell">
                <span className="ci-span-num">{item.num}</span>
                <div>
                  <h2 className="ci-span-title">{item.title}</h2>
                  <p className="ci-span-desc">{item.desc}</p>
                </div>
              </div>
            ))}
          </section>

          <hr className="ci-rule" />

          <section id="how-it-works" className="ci-feature" aria-labelledby="feature-title">
            <div className="ci-feature-copy">
              <p className="ci-eyebrow">01 / From thought to form</p>
              <h2 id="feature-title" className="ci-display ci-display--section">
                <span>Make space</span>{' '}
                <span>for better work<span className="ci-stop">.</span></span>
              </h2>
              <p className="ci-body">
                Your revenue, ad spend, AI models, legal compliance,
                {' '}<br className="ci-wide-break" />and security checks in one calm instrument.
              </p>
            </div>
            <div className="ci-feature-art">
              <img src={sculpture} width="918" height="380" alt="" decoding="async" loading="lazy" />
            </div>
          </section>

          <div className="ci-workflow-span">
            <div className="ci-workflow-step">
              <span className="ci-pill-tag">Step 01 · Connect</span>
              <h3>Pull stores, Stripe, or CSV</h3>
              <p>Connect read-only Stripe, App Store Connect, or Google Play keys, push via Custom API, or drop any CSV report.</p>
            </div>
            <div className="ci-workflow-step">
              <span className="ci-pill-tag">Step 02 · Choose AI</span>
              <h3>Route Cloud or Local Models</h3>
              <p>Attach your Gemini, Claude, or OpenAI key—or detect Ollama and LM Studio on localhost for 100% private runs.</p>
            </div>
            <div className="ci-workflow-step">
              <span className="ci-pill-tag">Step 03 · Ship Safe</span>
              <h3>Audit Security &amp; Publish</h3>
              <p>Scan for leaked keys and dependency CVEs, export Apple Privacy Manifests, and draft 7 tailored legal docs.</p>
            </div>
          </div>

          <hr className="ci-rule" />

          <section id="capabilities" className="ci-section" aria-labelledby="capabilities-title">
            <div className="ci-section-head">
              <div>
                <p className="ci-eyebrow">02 / Built for the whole indie loop</p>
                <h2 id="capabilities-title" className="ci-display ci-display--sub">
                  <span>Numbers, campaigns,</span>{' '}
                  <span>and clean handoffs<span className="ci-stop">.</span></span>
                </h2>
              </div>
              <p className="ci-body ci-section-aside">
                Every view reads your real daily figures and campaign exports—never vanity fluff or fabricated benchmarks.
              </p>
            </div>

            <div className="ci-bento-grid">
              <article className="ci-card ci-card--wide">
                <div className="ci-card-meta">
                  <span className="ci-pill-tag"><TrendingUp aria-hidden="true" /> Overall Income &amp; Simulator</span>
                  <span className="ci-mono-meta">Goal pacing · Net margin · What-If</span>
                </div>
                <h3>Track net profit after fees &amp; ads, not just gross sales</h3>
                <p>Compare 7, 30, and 90-day windows, filter by data source, watch monthly profit goal pacing, and model how price or churn changes affect LTV:CAC.</p>
                <div className="ci-metric-row">
                  <div><span className="ci-metric-k">Net Profit</span><span className="ci-metric-v">$11,940</span></div>
                  <div><span className="ci-metric-k">LTV : CAC</span><span className="ci-metric-v">4.2 : 1</span></div>
                  <div><span className="ci-metric-k">Payback</span><span className="ci-metric-v">3.1 mo</span></div>
                  <div><span className="ci-metric-k">Sources</span><span className="ci-metric-v">Stripe + Stores + CSV</span></div>
                </div>
              </article>

              <article className="ci-card">
                <div className="ci-card-meta">
                  <span className="ci-pill-tag"><Plug aria-hidden="true" /> Connections &amp; API</span>
                </div>
                <h3>Pre-flight validated connections</h3>
                <p>Guards against pasting secret Stripe keys, extracts Google Play service emails automatically, and gives copy-ready cURL, Swift, Python &amp; JS ingest snippets.</p>
              </article>

              <article className="ci-card">
                <div className="ci-card-meta">
                  <span className="ci-pill-tag"><ArrowRightLeft aria-hidden="true" /> Context Handoffs</span>
                </div>
                <h3>Move chats between AIs cleanly</h3>
                <p>Upload ChatGPT, Claude, Cursor, or Gemini exports. Secrets are stripped in your browser before your chosen AI condenses a crisp handoff.</p>
              </article>
            </div>
          </section>

          <hr className="ci-rule" />

          <section id="ai-models" className="ci-section" aria-labelledby="ai-title">
            <div className="ci-section-head">
              <div>
                <p className="ci-eyebrow">03 / Import Your AI</p>
                <h2 id="ai-title" className="ci-display ci-display--sub">
                  <span>Your keys. Your models.</span>{' '}
                  <span>Or <span className="ci-acid-highlight">100% local</span><span className="ci-stop">.</span></span>
                </h2>
              </div>
              <div className="ci-section-aside">
                <p className="ci-body">
                  Import keys for Gemini, Claude, OpenAI, or routers—or connect Ollama and LM Studio on localhost. Assign different models per task.
                </p>
                <Link to={aiImportTo} className="ci-text-link" style={{ marginTop: 8 }}>
                  Configure your AI models <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="ci-ai-grid">
              {AI_SHOWCASE.map((item) => (
                <article key={item.name} className={`ci-ai-card${item.highlight ? ' is-acid' : ''}`}>
                  <div className="ci-ai-card-top">
                    <span className="ci-pill-tag">
                      {item.highlight ? <HardDrive aria-hidden="true" /> : <KeyRound aria-hidden="true" />} {item.tag}
                    </span>
                    <Cpu aria-hidden="true" />
                  </div>
                  <h3>{item.name}</h3>
                  <p className="ci-mono-meta">{item.models}</p>
                  <p className="ci-ai-note">{item.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="security-legal" className="ci-dark-band" aria-labelledby="sec-title">
            <div className="ci-dark-head">
              <p className="ci-eyebrow ci-eyebrow--light">04 / Legal, Privacy &amp; Anti-Fragile Security</p>
              <h2 id="sec-title" className="ci-display ci-display--sub ci-display--light">
                <span>Ship without</span>{' '}
                <span><span className="ci-acid-highlight">leaked keys</span> or store rejections<span className="ci-stop">.</span></span>
              </h2>
              <p className="ci-dark-lede">
                Compliance checklists, structured legal drafting, store privacy manifests, and real vulnerability scanning built right into your workflow.
              </p>
            </div>

            <div className="ci-dark-grid">
              <div className="ci-dark-panel">
                <span className="ci-dark-badge"><FileCheck2 aria-hidden="true" /> Legal &amp; Store Compliance</span>
                <h3>7 Legal Docs + Store Manifest Builders</h3>
                <ul className="ci-dark-list">
                  <li><span className="ci-dark-num">01</span><span>Draft Privacy Policies, Terms, EULAs, Cookie Policies, DPAs, AI Notices, and Refund policies with placeholder auto-fill.</span></li>
                  <li><span className="ci-dark-num">02</span><span>Run automated clause audits for GDPR, CCPA, COPPA, and EU AI Act disclosures before exporting <code>.md</code> or <code>.html</code>.</span></li>
                  <li><span className="ci-dark-num">03</span><span>Generate ready-to-bundle Apple <code>PrivacyInfo.xcprivacy</code> XML and Google Play Data Safety declarations.</span></li>
                  <li><span className="ci-dark-num">04</span><span>Track iOS, Android, Web, Windows, macOS, and AI Safety launch requirements with official rule links.</span></li>
                </ul>
              </div>

              <div className="ci-dark-panel">
                <span className="ci-dark-badge ci-dark-badge--acid"><ShieldCheck aria-hidden="true" /> Security &amp; Anti-Fragile Lab</span>
                <h3>Browser Secret Scanner, CVE Audit &amp; Red Team</h3>
                <ul className="ci-dark-list">
                  <li><span className="ci-dark-num">01</span><span>Scan <code>.env</code> files, diffs, or folders locally in your browser for 14+ token patterns (OpenAI, Anthropic, Gemini, Stripe, AWS, private keys).</span></li>
                  <li><span className="ci-dark-num">02</span><span>Check <code>package.json</code> or lockfiles against the live <strong>OSV.dev</strong> vulnerability database for CVEs and patched versions.</span></li>
                  <li><span className="ci-dark-num">03</span><span>Generate strict CSP, HSTS, and RLS hardening policies for Cloudflare, Vercel, Netlify, and Supabase.</span></li>
                  <li><span className="ci-dark-num">04</span><span>Enforce read-only <code>github_pat_</code> &amp; <code>rk_live_</code> tokens, EU Frankfurt storage, and zero-retention chat condensing.</span></li>
                </ul>
              </div>
            </div>

            <div className="ci-dark-footer">
              <Link to={securityTo} className="ci-button ci-button--acid">
                Open Legal &amp; Security Lab <ArrowRight aria-hidden="true" />
              </Link>
              <span className="ci-dark-note">
                <Lock aria-hidden="true" /> Client-side secret &amp; dependency scans never upload your source code.
              </span>
            </div>
          </section>

          <section id="pricing" className="ci-section" aria-labelledby="pricing-title">
            <div className="ci-section-head">
              <div>
                <p className="ci-eyebrow">05 / Pricing</p>
                <h2 id="pricing-title" className="ci-display ci-display--sub">
                  <span>Start free with your own AI.</span>{' '}
                  <span>Upgrade for cloud sync<span className="ci-stop">.</span></span>
                </h2>
              </div>
              <div className="ci-billing-toggle" role="group" aria-label="Billing interval">
                <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')}>Monthly</button>
                <button type="button" aria-pressed={cycle === 'yearly'} onClick={() => setCycle('yearly')}>Yearly · 50% off</button>
              </div>
            </div>

            <div className="ci-pricing-grid">
              <article className="ci-price-card">
                <div className="ci-price-head">
                  <span className="ci-pill-tag">Free forever</span>
                  <p className="ci-price-val">$0<span> / month</span></p>
                </div>
                <p className="ci-price-sub">Everything needed to track income, import your own AI keys, and audit legal &amp; security posture.</p>
                <ul className="ci-price-list">
                  {FREE_FEATURES.map((f) => <li key={f}><Check aria-hidden="true" /> <span>{f}</span></li>)}
                </ul>
                <Link to={exploreTo} className="ci-button ci-button--secondary">
                  {user ? 'Open Free workspace' : 'Start free'} <ArrowRight aria-hidden="true" />
                </Link>
              </article>

              <article className="ci-price-card is-featured">
                <div className="ci-price-head">
                  <span className="ci-pill-tag ci-pill-tag--cobalt">Premium</span>
                  <p className="ci-price-val">
                    {cycle === 'yearly' && <s className="ci-price-was">$9.99</s>}
                    {cycle === 'monthly' ? '$9.99' : '$4.99'}
                    <span> / month</span>
                  </p>
                </div>
                <p className="ci-price-sub">
                  {cycle === 'monthly'
                    ? 'Billed monthly via Stripe. 14-day full refund, cancel anytime.'
                    : '$59.88 billed once a year (half off). 14-day full refund, cancel anytime.'}
                </p>
                <ul className="ci-price-list">
                  {PREMIUM_FEATURES.map((f) => <li key={f}><Check aria-hidden="true" /> <span>{f}</span></li>)}
                </ul>
                <Link to={user ? '/premium' : '/onboarding'} className="ci-button ci-button--primary ci-button--full">
                  {user ? 'See Premium plans' : 'Get started with Premium'} <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            </div>
          </section>

          <hr className="ci-rule" />

          <section id="faq" className="ci-section" aria-labelledby="faq-title">
            <div className="ci-faq-layout">
              <div>
                <p className="ci-eyebrow">06 / Questions</p>
                <h2 id="faq-title" className="ci-display ci-display--sub">
                  <span>Clear answers<span className="ci-stop">.</span></span>
                </h2>
                <p className="ci-body" style={{ marginTop: 14 }}>
                  Straight facts about custody, billing, local models, and how VibeAssist handles your data.
                </p>
              </div>
              <div className="ci-faq-list">
                {FAQ_ITEMS.map((item) => (
                  <details key={item.q} className="ci-faq-item">
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          <section className="ci-cta-band" aria-labelledby="cta-title">
            <div className="ci-cta-copy">
              <p className="ci-eyebrow ci-eyebrow--light">Ready when you are</p>
              <h2 id="cta-title" className="ci-display ci-display--sub ci-display--light">
                <span>Build calmly, verify fast,</span>{' '}
                <span>keep your margins<span className="ci-stop">.</span></span>
              </h2>
            </div>
            <div className="ci-cta-actions">
              <Link to={exploreTo} className="ci-button ci-button--acid">
                {user ? 'Go to Dashboard' : 'Create free account'} <ArrowRight aria-hidden="true" />
              </Link>
              <Link to={aiImportTo} className="ci-button ci-button--ghost-light">
                Connect your AI key
              </Link>
            </div>
          </section>
        </main>

        <footer className="ci-footer">
          <div className="ci-footer-top">
            <div className="ci-footer-brand">
              <div className="ci-brand-inline">
                <BrandMark className="ci-brand-mark-sm" />
                <strong>VibeAssist</strong>
              </div>
              <p>Revenue intelligence, BYOK &amp; local AI routing, legal compliance, and anti-fragile security for indie software makers.</p>
            </div>
            <div className="ci-footer-cols">
              <div>
                <h3>Platform</h3>
                <ul>
                  <li><a href="#capabilities">Capabilities</a></li>
                  <li><a href="#ai-models">Import Your AI</a></li>
                  <li><a href="#security-legal">Legal &amp; Security</a></li>
                  <li><a href="#pricing">Pricing</a></li>
                </ul>
              </div>
              <div>
                <h3>Workspace</h3>
                <ul>
                  <li><Link to={exploreTo}>Overall Income</Link></li>
                  <li><Link to={aiImportTo}>AI Model Vault</Link></li>
                  <li><Link to={securityTo}>Security Scanner</Link></li>
                  <li><Link to={user ? '/integrations' : '/onboarding'}>Connections &amp; CSV</Link></li>
                </ul>
              </div>
              <div>
                <h3>Legal</h3>
                <LegalLinks className="ci-footer-legal" />
              </div>
            </div>
          </div>

          <div className="ci-footnote">
            <span>VibeAssist / Revenue + Ads + BYOK AI + Legal &amp; Security</span>
            {BUSINESS.name && <span>{BUSINESS.name}{BUSINESS.vatNumber && ` / P.IVA ${BUSINESS.vatNumber}`}</span>}
          </div>
        </footer>
      </div>
    </div>
  );
}
