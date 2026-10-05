import React from 'react';
import { Link } from 'react-router-dom';
import { BUSINESS } from '../lib/business';

export default function LegalLinks({ className = 'legal-links' }) {
  return (
    <nav className={className} aria-label="Legal">
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/refunds">Refunds</Link>
      {BUSINESS.email && <a href={`mailto:${BUSINESS.email}`}>Contact</a>}
    </nav>
  );
}
