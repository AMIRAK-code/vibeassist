import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, ShieldCheck } from 'lucide-react';
import BrandMark from '../components/landing/BrandMark';
import LegalLinks from '../components/LegalLinks';
import { BUSINESS, detail, LEGAL_UPDATED } from '../lib/business';

function LegalLayout({ title, summary, toc = [], children }) {
  useEffect(() => {
    document.title = `${title} · VibeAssist`;
    window.scrollTo(0, 0);
  }, [title]);

  return (
    <main className="legal-page">
      <div className="legal-inner">
        <div className="flex-between" style={{ marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
          <Link to="/" className="auth-brand" style={{ marginBottom: 0 }}><BrandMark /> VibeAssist</Link>
          <div className="page-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
              <Printer aria-hidden="true" /> Print / PDF
            </button>
            <Link to="/" className="btn btn-ghost btn-sm"><ArrowLeft aria-hidden="true" /> Home</Link>
          </div>
        </div>

        <h1>{title}</h1>
        <p className="muted">Last updated {LEGAL_UPDATED}</p>

        {summary && (
          <div className="card card--raised" style={{ marginTop: 18, marginBottom: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck aria-hidden="true" style={{ width: 18, height: 18, color: 'var(--ci-cobalt)' }} />
              Plain-English Summary
            </h2>
            <p style={{ marginTop: 6, marginBottom: 0 }}>{summary}</p>
          </div>
        )}

        {toc.length > 0 && (
          <nav className="legal-toc" aria-label="On this page">
            {toc.map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}
          </nav>
        )}

        {children}
        <LegalLinks />
      </div>
    </main>
  );
}

const Who = () => (
  <p>
    VibeAssist is run by <strong>{detail('name')}</strong>, {detail('address')}, {BUSINESS.country}
    {' '}(VAT {detail('vatNumber')}). Write to <strong>{detail('email')}</strong> about anything on this page.
  </p>
);

export function Terms() {
  return (
    <LegalLayout
      title="Terms of service"
      summary="Your revenue data, campaigns, and documents stay yours. Paid Premium features are billed via Stripe and cancelable anytime with a 14-day refund window on your first payment."
      toc={[
        { id: 'who', label: 'Who we are' },
        { id: 'service', label: 'The service' },
        { id: 'plans', label: 'Free & Premium' },
        { id: 'ai', label: 'AI drafts & BYOK' },
        { id: 'data', label: 'Your data' },
        { id: 'liability', label: 'Liability & Law' },
      ]}
    >
      <h2 id="who">Who we are</h2>
      <Who />

      <h2 id="service">The service</h2>
      <p>VibeAssist helps indie app makers track revenue, downloads, and ad spend, connect AI models, and prepare store compliance and security posture checks. You need to be at least 18 and able to enter a contract to use it. Keep your password and API keys confidential; you're responsible for activity under your account.</p>

      <h2 id="plans">Free and Premium</h2>
      <ul>
        <li>The Free plan costs nothing and has no time limit. It includes Overall Income tracking, Import Your AI (BYOK &amp; Local models), browser-side Legal &amp; Security tools, Context Handoffs, and the Weekly Vibe newsletter.</li>
        <li>Premium costs the price shown on the plans page, billed in advance every month or every year. Prices don't include VAT; where it applies, it's added at checkout based on where you are.</li>
        <li>Premium renews automatically until you cancel. Cancel any time in Settings → Manage billing; you keep Premium until the end of the period you've paid for, and you won't be charged again.</li>
        <li>If we change the price, we'll email you at least 30 days before it applies to your next renewal, so you can cancel first.</li>
        <li>When it's on offer, the <strong>60-day pass</strong> is a single payment for 60 days of Premium. It doesn't renew and each account can buy it once. If you subscribe while it's running, your first subscription payment is taken when the pass ends.</li>
        <li>Payments are handled by Stripe. We never see or store your card details.</li>
      </ul>
      <p>Refunds are covered in the <Link to="/refunds">refund policy</Link>.</p>

      <h2 id="ai">Suggestions, drafts, and Bring-Your-Own-AI</h2>
      <p>Weekly plans, analyzer answers, security reviews, and legal document drafts are written either by VibeAssist's AI, by structured templates, or directly by an AI provider or local server you connect under Import Your AI. AI outputs can be wrong or incomplete. They are starting drafts and analytical aids—not financial, legal, security, or tax advice. Always review outputs and have qualified counsel check legal documents before publishing.</p>
      <p>When you import your own API key (such as Google Gemini, Anthropic, OpenAI, or OpenRouter), requests go directly from your browser to that provider under your own account, rate limits, and provider terms.</p>

      <h2 id="data">Your data</h2>
      <p>What you enter or import stays yours. You let us store and process it only to run VibeAssist for you, as described in the <Link to="/privacy">privacy policy</Link>. You can export all your numbers and workspace data from Settings at any time.</p>

      <h2>Fair use</h2>
      <p>Don't use VibeAssist to break the law, to send data you have no right to send, or to disrupt the service or other people's accounts, for example by overloading API endpoints or bypassing plan limits. We may suspend accounts that do.</p>

      <h2>Availability and changes</h2>
      <p>We work to keep VibeAssist running and your data safe, but we can't promise uninterrupted availability. We may improve or change features; if a change removes something important from a plan you pay for, you can cancel and ask for a refund of the unused part.</p>

      <h2 id="liability">Liability &amp; Law</h2>
      <p>As far as the law allows, our total liability to you is limited to what you paid us in the 12 months before the claim. Nothing here limits rights you have as a consumer that can't be limited by contract, or liability for gross negligence or wilful misconduct.</p>
      <p>You can stop using VibeAssist at any time and ask us to delete your account. These terms are governed by Italian law. If you're a consumer, you also keep the protection of the laws of the country you live in, and you can bring a claim there.</p>
    </LegalLayout>
  );
}

export function Privacy() {
  return (
    <LegalLayout
      title="Privacy policy"
      summary="No ad tracking, no data selling. Secret scans and local AI calls happen directly inside your browser; database rows live in the EU (Frankfurt) protected by Row-Level Security."
      toc={[
        { id: 'who', label: 'Controller' },
        { id: 'collect', label: 'Data we collect' },
        { id: 'byok', label: 'BYOK & Local AI' },
        { id: 'processors', label: 'Subprocessors' },
        { id: 'cookies', label: 'Storage & Cookies' },
        { id: 'rights', label: 'Your rights' },
      ]}
    >
      <h2 id="who">Who is responsible</h2>
      <Who />

      <h2 id="collect">What we collect, and why</h2>
      <ul>
        <li><strong>Your account:</strong> email address, password (stored only as a secure hash) and, if you give it, your name. Needed to run your account.</li>
        <li><strong>Your profile:</strong> experience, profit target, goals, currency and launch checklist ticks. Used to tailor plans and remember your progress.</li>
        <li><strong>Your numbers:</strong> the daily figures and ad campaigns you enter, import via CSV, send through the Custom API, or sync from Stripe, the App Store or Google Play. If you connect a store or Stripe key, we keep the read-only credential encrypted in Vault and import daily totals, not end-customer personal details.</li>
        <li><strong>Legal documents &amp; handoffs:</strong> drafts you generate or edit and any share links you explicitly create. Raw chat uploads are parsed and scrubbed of secrets in your browser; we keep the condensed handoff, never the raw transcript.</li>
        <li><strong>The Weekly Vibe email</strong> (only if you subscribe): consent timestamp, consent wording, and whether to include your weekly numbers.</li>
        <li><strong>Billing:</strong> plan status, renewal date, and Stripe customer reference. Stripe holds card and invoice details.</li>
      </ul>
      <p>We process this data to deliver the service you requested (contract), keep the platform secure (legitimate interest), and satisfy tax/accounting laws (legal obligation). We never sell your data and run no third-party advertising trackers.</p>

      <h2 id="byok">Bring-Your-Own-AI, Local Models &amp; Security Lab</h2>
      <ul>
        <li><strong>Browser-stored AI keys:</strong> API keys added under Import Your AI are saved locally in your browser&apos;s <code>localStorage</code> or <code>sessionStorage</code> and sent directly from your browser to the provider you chose (Google Gemini, Anthropic, OpenAI, OpenRouter, Groq, DeepSeek, Mistral, or your localhost endpoint). They are never transmitted to VibeAssist servers unless you explicitly opt into encrypted Cloud Gateway sync.</li>
        <li><strong>Local models (Ollama / LM Studio / vLLM):</strong> prompts and code sent to a localhost endpoint never leave your machine.</li>
        <li><strong>Security Lab scans:</strong> the Secret Leak Scanner runs 100% in browser memory; files are never uploaded. When you run a Dependency CVE scan, only package names and versions (never your source code) are queried against <strong>OSV.dev</strong>.</li>
      </ul>

      <h2 id="processors">Who else handles it</h2>
      <ul>
        <li><strong>Supabase</strong> stores the database and runs authentication, in the EU (Frankfurt).</li>
        <li><strong>Stripe</strong> takes payments and handles tax on them.</li>
        <li><strong>Anthropic</strong> powers VibeAssist Cloud AI features only when you trigger them without a local/BYOK override. It receives summarized numbers/inputs—never your password or Stripe keys—and does not train on API traffic.</li>
        <li><strong>Apple</strong> and <strong>Google</strong>, only if you connect App Store Connect or Google Play reports.</li>
        <li><strong>Cloudflare</strong> serves the website edge cache.</li>
        <li><strong>HaveIBeenPwned</strong> checks passwords via k-anonymity (only the first 5 SHA-1 characters leave your browser).</li>
        <li><strong>Resend (EU)</strong> delivers confirmation and Weekly Vibe emails without open/click tracking.</li>
        <li><strong>Hacker News (Algolia)</strong> &amp; <strong>OSV.dev</strong> receive browser requests when you search news topics or scan dependency versions.</li>
      </ul>
      <p>Transfers outside the EU rely on EU Standard Contractual Clauses (SCCs) or equivalent safeguards.</p>

      <h2 id="cookies">Cookies and storage</h2>
      <p>We do not use advertising or analytics cookies. Your browser stores your sign-in session, UI preferences, drafts, and optional browser-local AI keys so the app functions cleanly.</p>

      <h2>How long we keep it</h2>
      <p>We keep your account data while your account is active and delete it within 30 days of an account deletion request. Payment records are retained as required by tax law (10 years in Italy).</p>

      <h2 id="rights">Your rights</h2>
      <p>You can access, correct, export (CSV and JSON in Settings), or request deletion of your data by writing to {detail('email')}. You may lodge a complaint with the Italian data protection authority (Garante) or your local authority.</p>
    </LegalLayout>
  );
}

export function Refunds() {
  return (
    <LegalLayout
      title="Refunds and cancellation"
      summary="Cancel Premium anytime in Settings → Manage billing. Full 14-day refund on your first Premium payment or 60-day pass."
      toc={[
        { id: 'cancel', label: 'Cancelling' },
        { id: 'refunds', label: 'Refunds' },
        { id: 'rights', label: 'Legal rights' },
      ]}
    >
      <h2 id="cancel">Cancelling</h2>
      <p>Cancel Premium any time in Settings → Manage billing. You won't be charged again, and Premium stays on until the end of the period you've already paid for. Your data stays in your account on the Free plan.</p>

      <h2 id="refunds">Refunds</h2>
      <ul>
        <li><strong>First payment:</strong> if Premium isn't for you, ask within 14 days of your first payment and we'll refund it in full.</li>
        <li><strong>60-day pass:</strong> ask within 14 days of paying and we'll refund it in full; Premium ends when the refund is made. If your account can't use the pass (for example it already has a subscription), we refund it automatically.</li>
        <li><strong>Renewals:</strong> a renewal that has already started isn't refunded, except where the law requires it or something went wrong on our side. If you forgot to cancel, write to us within 7 days of the renewal and we'll look at it.</li>
      </ul>
      <p>To ask for a refund, write to {detail('email')} from the email address of your account. Refunds go back to the card you paid with, usually within 5 to 10 working days.</p>

      <h2 id="rights">Your legal rights</h2>
      <p>This policy adds to your rights as a consumer; it doesn't replace them.</p>
    </LegalLayout>
  );
}
