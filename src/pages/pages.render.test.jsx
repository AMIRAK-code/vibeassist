import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthContext } from '../context/auth';
import { ToastProvider } from '../components/ui/Toast';
import Landing from './Landing';
import ImportAI from './ImportAI';
import { Terms, Privacy } from './Legal';
import SecurityCenter from '../components/SecurityCenter';
import StorePrivacyBuilder from '../components/StorePrivacyBuilder';
import MetricsCsvImport from '../components/MetricsCsvImport';

const authValue = {
  session: { user: { id: 'u1', email: 'maker@example.com' } },
  user: { id: 'u1', email: 'maker@example.com' },
  profile: { name: 'Ada', currency: 'USD', goals: ['Grow revenue'], experience: 'Pro', profit_expectancy: '$1,000 - $10,000' },
  subscription: { plan: 'free', source: 'demo' },
  hasPremium: false,
  loading: false,
  refreshAccount: async () => {},
  signOut: async () => {},
};

const renderPage = (node) => renderToString(
  <AuthContext.Provider value={authValue}>
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>
  </AuthContext.Provider>,
).replace(/<!-- -->/g, '');

describe('Elevated platform & landing pages render cleanly', () => {
  it('renders the expanded Landing page and interactive WorkspacePreview', () => {
    const html = renderPage(<Landing />);
    expect(html).toContain('Less friction');
    expect(html).toContain('Import Your AI');
    expect(html).toContain('Google Gemini');
    expect(html).toContain('PrivacyInfo.xcprivacy');
    expect(html).toContain('AI &amp; Security');
  });

  it('renders ImportAI hub with top cloud and local providers', () => {
    const html = renderPage(<ImportAI />);
    expect(html).toContain('Import Your AI');
    expect(html).toContain('Google Gemini');
    expect(html).toContain('Anthropic Claude');
    expect(html).toContain('OpenAI');
    expect(html).toContain('Per-Section AI Routing');
    expect(html).toContain('Live Model Test Bench');
  });

  it('renders SecurityCenter, StorePrivacyBuilder, MetricsCsvImport, and Legal pages', () => {
    const secHtml = renderPage(<SecurityCenter />);
    expect(secHtml).toContain('Client-Side Secret &amp; Credential Leak Scanner');
    expect(secHtml).toContain('Dependency CVE Scanner');

    const manifestHtml = renderPage(<StorePrivacyBuilder />);
    expect(manifestHtml).toContain('PrivacyInfo.xcprivacy');
    expect(manifestHtml).toContain('Google Play Data Safety Matrix');

    const csvHtml = renderPage(<MetricsCsvImport onImported={() => {}} />);
    expect(csvHtml).toContain('Universal CSV Metrics Importer');

    expect(renderPage(<Terms />)).toContain('Plain-English Summary');
    expect(renderPage(<Privacy />)).toContain('Bring-Your-Own-AI, Local Models');
  });
});
