import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Menu, X } from 'lucide-react';
import { useAuth } from '../context/auth';
import BrandMark from '../components/landing/BrandMark';
import WorkspacePreview from '../components/landing/WorkspacePreview';
import sculpture from '../assets/landing/clay-sculpture.webp';
import '../styles/tokens.css';
import './Landing.css';
import LegalLinks from '../components/LegalLinks';
import { BUSINESS } from '../lib/business';

function SiteHeader({ exploreTo, signedIn }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef(null);

  // Close the mobile menu with Escape or a click outside it
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
      <a href="#product" onClick={close}>Product</a>
      <a href="#how-it-works" onClick={close}>How it works</a>
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
        <Link to={exploreTo} className="ci-button ci-button--compact">Explore</Link>
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
  // Signed-in visitors go straight to their dashboard; everyone else starts onboarding
  const exploreTo = user ? '/dashboard' : '/onboarding';

  return (
    <div className="ci-page">
      <div className="ci-shell">
        <SiteHeader exploreTo={exploreTo} signedIn={Boolean(user)} />

        <main>
          <section className="ci-hero" aria-labelledby="hero-title">
            <div className="ci-hero-copy">
              <p className="ci-eyebrow">For indie app makers</p>
              <h1 id="hero-title" className="ci-display">
                <span>Less friction<span className="ci-stop">.</span></span>{' '}
                <span>More flow<span className="ci-stop">.</span></span>
              </h1>
              <p className="ci-lede">See what your apps earn, and what to do next.</p>
              <div className="ci-actions">
                <Link to={exploreTo} className="ci-button ci-button--primary">
                  Explore the workspace <ArrowRight aria-hidden="true" />
                </Link>
                <a href="#how-it-works" className="ci-text-link">
                  See how it works <ChevronRight aria-hidden="true" />
                </a>
              </div>
            </div>
            <WorkspacePreview id="product" />
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
                Your app numbers in one place, so you can focus,
                {' '}<br className="ci-wide-break" />explore, and make progress.
              </p>
            </div>
            <div className="ci-feature-art">
              <img src={sculpture} width="918" height="380" alt="" decoding="async" loading="lazy" />
            </div>
          </section>
        </main>

        <footer className="ci-footnote">
          <span>VibeAssist / Revenue + Ads + Advice / For indie app makers</span>
          {BUSINESS.name && <span>{BUSINESS.name}{BUSINESS.vatNumber && ` / P.IVA ${BUSINESS.vatNumber}`}</span>}
          <LegalLinks className="ci-footnote-links" />
        </footer>
      </div>
    </div>
  );
}
