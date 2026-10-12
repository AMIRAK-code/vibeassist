// Smoke test: the Context Handoffs components render with realistic data, so a typo in a prop
// or field name shows up here rather than as a blank page.
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../ui/Toast';
import HandoffCreate, { AskYourAi, FromChat } from './HandoffCreate';
import HandoffView from './HandoffView';
import HandoffBody from './HandoffBody';
import SharedHandoff from '../../pages/SharedHandoff';
import { cleanSections } from '../../lib/handoffs';

const render = (node) => renderToString(<MemoryRouter><ToastProvider>{node}</ToastProvider></MemoryRouter>).replace(/<!-- -->/g, '');
const noop = () => {};

const handoff = {
  id: 'h1', title: 'Stripe webhook refactor', source: 'claude_code', method: 'ai', model: 'claude-opus-5-5', message_count: 42,
  created_at: '2026-10-12T09:00:00Z', updated_at: '2026-10-12T10:00:00Z',
  sections: cleanSections([
    { key: 'goal', body: 'Handle renewals with webhooks.' },
    { key: 'next', body: '- Add the signature check\n- Write tests' },
    { key: 'artifacts', body: 'In supabase/functions/stripe-webhook:\n```ts\nverifyStripeSignature(payload, header, secret)\n```' },
  ]),
};

describe('Context Handoffs components', () => {
  it('render both ways of making a handoff', () => {
    const create = render(<HandoffCreate atLimit={false} hasPremium={false} ai={{ label: "VibeAssist's Claude", ownKey: false }} runsLeft={5} onCreated={noop} onMaybeLater={noop} />);
    expect(create).toContain('Ask your AI to write it');
    expect(create).toContain('Copy prompt');
    expect(render(<AskYourAi disabled={false} hasPremium onCreated={noop} />)).toContain('Paste the AI&#x27;s answer');
    expect(render(<FromChat disabled={false} ai={{ label: 'your OpenAI key (gpt-4.1-mini)', ownKey: true }} runsLeft={50} onCreated={noop} onMaybeLater={noop} />)).toContain('Choose a file');
  });

  it('explains the free limit', () => {
    expect(render(<HandoffCreate atLimit hasPremium={false} ai={{ label: 'x', ownKey: false }} runsLeft={5} onCreated={noop} onMaybeLater={noop} />)).toContain('Free accounts keep 3 handoffs');
  });

  it('shows a handoff with code, lists, empty sections and the share panel', () => {
    const premium = render(<HandoffView handoff={handoff} hasPremium onSaved={noop} onDelete={noop} />);
    expect(premium).toContain('Stripe webhook refactor');
    expect(premium).toContain('From Claude Code · condensed by claude-opus-5-5 · 42 messages');
    expect(premium).toContain('<code>verifyStripeSignature(payload, header, secret)</code>');
    expect(premium).toContain('<li>Add the signature check</li>');
    expect(premium).toContain('Nothing yet.');
    expect(premium).toContain('Make a link');
    expect(render(<HandoffView handoff={handoff} hasPremium={false} onSaved={noop} onDelete={noop} />)).toContain('part of Premium');
  });

  it('renders sections as text, never as HTML', () => {
    const html = render(<HandoffBody sections={cleanSections([{ key: 'goal', body: '<img src=x onerror=alert(1)>' }])} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('opens the shared page while the link is checked', () => {
    expect(render(<SharedHandoff />)).toContain('Opening the handoff');
  });
});
