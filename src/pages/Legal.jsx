import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BrandMark from '../components/landing/BrandMark';
import LegalLinks from '../components/LegalLinks';
import { BUSINESS, detail, LEGAL_UPDATED } from '../lib/business';

// Starting drafts written to match what the app actually does with data and money. They are
// not legal advice: have them checked for your situation before relying on them.

function LegalLayout({ title, children }) {
  useEffect(() => {
    document.title = `${title} · VibeAssist`;
    window.scrollTo(0, 0);
  }, [title]);
  return (
    <main className="legal-page">
      <div className="legal-inner">
        <div className="flex-between" style={{ marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
          <Link to="/" className="auth-brand" style={{ marginBottom: 0 }}><BrandMark /> VibeAssist</Link>
          <Link to="/" className="btn btn-ghost"><ArrowLeft aria-hidden="true" /> Home</Link>
        </div>
        <h1>{title}</h1>
        <p className="muted">Last updated {LEGAL_UPDATED}</p>
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
    <LegalLayout title="Terms of service">
      <h2>Who we are</h2>
      <Who />

      <h2>The service</h2>
      <p>VibeAssist shows indie app makers their revenue, downloads and ad spend, and suggests next steps. You need to be at least 18 and able to enter a contract to use it. Keep your password to yourself; you're responsible for what happens in your account.</p>

      <h2>Free and Premium</h2>
      <ul>
        <li>The Free plan costs nothing and has no time limit.</li>
        <li>Premium costs the price shown on the plans page, billed in advance every month or every year. Prices don't include VAT; where it applies, it's added at checkout based on where you are.</li>
        <li>Premium renews automatically until you cancel. Cancel any time in Settings → Manage billing; you keep Premium until the end of the period you've paid for, and you won't be charged again.</li>
        <li>If we change the price, we'll email you at least 30 days before it applies to your next renewal, so you can cancel first.</li>
        <li>Payments are handled by Stripe. We never see or store your card details.</li>
      </ul>
      <p>Refunds are covered in the <Link to="/refunds">refund policy</Link>.</p>

      <h2>Suggestions written by AI</h2>
      <p>Weekly plans and answers are written by an AI model from the numbers you give us. They can be wrong or incomplete. They're suggestions, not financial, legal or tax advice; check them before you act on them.</p>

      <h2>Your data</h2>
      <p>What you enter or import stays yours. You let us store and process it only to run VibeAssist for you, as described in the <Link to="/privacy">privacy policy</Link>. You can export all your numbers from Settings at any time.</p>

      <h2>Fair use</h2>
      <p>Don't use VibeAssist to break the law, to send data you have no right to send, or to disrupt the service or other people's accounts, for example by overloading the API or trying to get around plan limits. We may suspend accounts that do.</p>

      <h2>Availability and changes</h2>
      <p>We work to keep VibeAssist running and your data safe, but we can't promise it will never be unavailable. We may improve or change features; if a change removes something important from a plan you pay for, you can cancel and ask for a refund of the unused part.</p>

      <h2>Liability</h2>
      <p>As far as the law allows, our total liability to you is limited to what you paid us in the 12 months before the claim. Nothing here limits rights you have as a consumer that can't be limited by contract, or liability for gross negligence or wilful misconduct.</p>

      <h2>Ending the agreement</h2>
      <p>You can stop using VibeAssist at any time and ask us to delete your account. We may close accounts that break these terms, after telling you why where we can.</p>

      <h2>Law</h2>
      <p>These terms are governed by Italian law. If you're a consumer, you also keep the protection of the laws of the country you live in, and you can bring a claim there.</p>
    </LegalLayout>
  );
}

export function Privacy() {
  return (
    <LegalLayout title="Privacy policy">
      <h2>Who is responsible</h2>
      <Who />

      <h2>What we collect, and why</h2>
      <ul>
        <li><strong>Your account:</strong> email address, password (stored only as a secure hash) and, if you give it, your name. Needed to run your account.</li>
        <li><strong>Your profile:</strong> experience, profit target, goals, currency and launch checklist ticks. Used to tailor plans and remember your progress.</li>
        <li><strong>Your numbers:</strong> the daily figures and ad campaigns you enter, send through the Custom API or import from Stripe. If you connect Stripe, we keep your read-only key encrypted and import daily totals, not your customers' details.</li>
        <li><strong>Plans and questions:</strong> the plans you ask for and the questions you ask, plus a daily count of requests to enforce the limit.</li>
        <li><strong>Billing:</strong> your plan, its status and renewal date, and the Stripe customer reference. Stripe holds your card and invoice details.</li>
      </ul>
      <p>We use this to provide the service you signed up for (contract), to keep it secure and prevent abuse (legitimate interest), and to keep accounting records (legal obligation). We don't sell your data, and there is no advertising or tracking.</p>

      <h2>Who else handles it</h2>
      <ul>
        <li><strong>Supabase</strong> stores the database and runs sign-in, in the EU (Frankfurt).</li>
        <li><strong>Stripe</strong> takes payments and handles tax on them.</li>
        <li><strong>Anthropic</strong> writes plans and answers. Only when you ask for one, it receives a summary of your numbers, your campaigns and your profile answers; never your email address or keys. It doesn't use this to train its models.</li>
        <li><strong>Cloudflare</strong> serves this website.</li>
        <li>Our <strong>email provider</strong> sends sign-up and password emails.</li>
        <li>The News page loads stories straight from <strong>Hacker News (Algolia)</strong>, which sees your browser's IP address when you open it.</li>
      </ul>
      <p>Some of these companies may process data outside the EU. Where they do, they're bound by the EU's Standard Contractual Clauses.</p>

      <h2>Cookies and storage</h2>
      <p>We don't use advertising or analytics cookies. Your browser stores your sign-in session and a few view preferences (such as the period you last chose) so the app works. Stripe's checkout page sets its own cookies to process payments safely.</p>

      <h2>How long we keep it</h2>
      <p>We keep your data while you have an account. Ask us to delete your account and we'll delete your data within 30 days. Payment records are kept by Stripe and by us for as long as tax law requires (10 years in Italy).</p>

      <h2>Your rights</h2>
      <p>You can ask to see, correct, export or delete your data, or object to how we use it, by writing to {detail('email')}. You can download all your numbers yourself from Settings. If you think we've mishandled your data, you can complain to the Italian data protection authority (Garante per la protezione dei dati personali) or the one where you live.</p>
    </LegalLayout>
  );
}

export function Refunds() {
  return (
    <LegalLayout title="Refunds and cancellation">
      <h2>Cancelling</h2>
      <p>Cancel Premium any time in Settings → Manage billing. You won't be charged again, and Premium stays on until the end of the period you've already paid for. Your data stays in your account on the Free plan.</p>

      <h2>Refunds</h2>
      <ul>
        <li><strong>First payment:</strong> if Premium isn't for you, ask within 14 days of your first payment and we'll refund it in full.</li>
        <li><strong>Renewals:</strong> a renewal that has already started isn't refunded, except where the law requires it or something went wrong on our side. If you forgot to cancel, write to us within 7 days of the renewal and we'll look at it.</li>
      </ul>
      <p>To ask for a refund, write to {detail('email')} from the email address of your account. Refunds go back to the card you paid with, usually within 5 to 10 working days.</p>

      <h2>Your legal rights</h2>
      <p>This policy adds to your rights as a consumer; it doesn't replace them.</p>
    </LegalLayout>
  );
}
