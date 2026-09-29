import { Link } from 'react-router-dom';
import { ArrowRight, Code, BarChart3, Plug, Compass } from 'lucide-react';
import { SampleBadge } from '../components/UI';

export default function Landing({ hasProject = false }) {
  return <div className="landing">
    <a className="skip-link" href="#landing-content">Skip to content</a>
    <header className="landing-nav">
      <Link to="/" className="brand"><Code aria-hidden="true" />VibeAssist</Link>
      <nav className="landing-actions" aria-label="Getting started">
        <a className="landing-demo-link" href="#product-preview">See the preview</a>
        <Link className="btn btn-primary" to={hasProject ? '/dashboard' : '/onboarding'}>{hasProject ? 'Open workspace' : 'Get started'}<ArrowRight size={16} aria-hidden="true" /></Link>
      </nav>
    </header>
    <main id="landing-content" tabIndex={-1}>
      <section className="landing-hero">
        <span className="eyebrow">A little clarity for your next big idea</span>
        <h1>Your apps.<br /><span className="text-gradient">A clearer next step.</span></h1>
        <p>Bring your project into focus. Explore your numbers, plan your launch, and decide what to work on next.</p>
        <div className="hero-actions">
          <Link className="btn btn-primary" to="/onboarding">Set up your project <ArrowRight size={18} aria-hidden="true" /></Link>
          <Link className="btn btn-secondary" to="/onboarding?demo=1">Explore with sample data</Link>
        </div>
        <p className="hero-note">An early preview. No payment or account required.<br />Live connections and AI analysis are not available yet.</p>
      </section>
      <section id="product-preview" className="product-preview glass-panel" aria-labelledby="preview-title">
        <div className="flex-between"><div><span className="eyebrow">Your workspace, at a glance</span><h2 id="preview-title">Make room for the bigger picture.</h2></div><SampleBadge /></div>
        <div className="preview-grid">
          <div className="preview-metric"><span>Revenue · sample week</span><strong>$19,550</strong><p>A clear view of what your app earns.</p></div>
          <div className="preview-metric"><span>Downloads · sample week</span><strong>30,406</strong><p>Understand reach alongside revenue.</p></div>
          <div className="preview-next"><Compass size={24} aria-hidden="true" /><h3>One useful next step</h3><p>Choose a project, explore the overview, then build your launch checklist.</p><Link to="/onboarding">Create your workspace <ArrowRight size={16} aria-hidden="true" /></Link></div>
        </div>
      </section>
      <section className="landing-features" aria-label="How it works">
        {[
          { icon: Plug, title: 'Start with your project', text: 'Choose your platform and the data source you would like to connect.' },
          { icon: BarChart3, title: 'Understand the numbers', text: 'Explore clearly labeled sample revenue and downloads, with readable charts and tables.' },
          { icon: Compass, title: 'Find your next action', text: 'Move from the overview to practical launch resources and planning tools.' },
        ].map(({ icon: Icon, title, text }) => <article key={title}><Icon size={24} aria-hidden="true" /><h3>{title}</h3><p>{text}</p></article>)}
      </section>
    </main>
    <footer className="landing-footer"><span>VibeAssist · Built for independent makers</span><span>Your project stays in this browser.</span></footer>
  </div>;
}
