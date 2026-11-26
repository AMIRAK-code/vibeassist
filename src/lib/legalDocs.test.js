import { describe, expect, it } from 'vitest';
import {
  applyPlaceholderReplacements, auditLegalDocument, bodyBlocks, buildDeterministicDraft,
  countPlaceholders, dbKindFor, DOC_KINDS, effectiveKind, EMPTY_INPUTS, extractPlaceholders,
  fileName, toHtml, toMarkdown, toPlainText, validateInputs,
} from './legalDocs';

const doc = {
  kind: 'privacy',
  title: 'Privacy Policy for <Notes>',
  inputs: { appName: 'My Notes App' },
  sections: [
    { heading: 'What we collect', body: 'We collect your email.\n\n- Email address\n- Crash reports' },
    { heading: 'Contact', body: 'Write to [placeholder: support email] & we reply.' },
  ],
};

describe('validateInputs', () => {
  it('asks for the facts a draft needs', () => {
    const errors = validateInputs(EMPTY_INPUTS);
    expect(Object.keys(errors).sort()).toEqual(['appName', 'contactEmail', 'country', 'developerName', 'monetization', 'platforms']);
  });

  it('accepts a complete set of answers and checks the website format', () => {
    const inputs = { ...EMPTY_INPUTS, appName: 'Notes', developerName: 'Faraz', contactEmail: 'hi@example.com', country: 'Italy', platforms: ['ios'], monetization: ['free'] };
    expect(validateInputs(inputs)).toEqual({});
    expect(validateInputs({ ...inputs, website: 'example.com' }).website).toBeDefined();
  });
});

describe('document rendering', () => {
  it('splits a section body into paragraphs and lists', () => {
    expect(bodyBlocks(doc.sections[0].body)).toEqual([
      { type: 'p', text: 'We collect your email.' },
      { type: 'ul', items: ['Email address', 'Crash reports'] },
    ]);
  });

  it('exports text, Markdown and escaped HTML', () => {
    expect(toPlainText(doc)).toMatch(/^Privacy Policy for <Notes>\n\nWhat we collect/);
    expect(toMarkdown(doc)).toMatch(/^# Privacy Policy for <Notes>\n\n## What we collect\n/);
    const html = toHtml(doc);
    expect(html).toContain('<title>Privacy Policy for &lt;Notes&gt;</title>');
    expect(html).toContain('<ul><li>Email address</li><li>Crash reports</li></ul>');
    expect(html).toContain('[placeholder: support email] &amp; we reply.');
    expect(html).not.toContain('<Notes>');
  });

  it('names files after the document and counts placeholders left to fill', () => {
    expect(fileName(doc, 'md')).toBe('privacy-policy-my-notes-app.md');
    expect(countPlaceholders(doc)).toBe(1);
    expect(extractPlaceholders(doc)).toEqual(['[placeholder: support email]']);
  });
});

describe('expanded legal studio & compliance auditor', () => {
  it('maps extended doc kinds cleanly to database kinds', () => {
    expect(DOC_KINDS.length).toBe(7);
    expect(dbKindFor('cookies')).toBe('privacy');
    expect(dbKindFor('dpa')).toBe('privacy');
    expect(dbKindFor('ai_policy')).toBe('terms');
    expect(effectiveKind({ kind: 'privacy', inputs: { docKind: 'dpa' } })).toBe('dpa');
  });

  it('builds deterministic drafts, fills placeholders, and audits clauses', () => {
    const inputs = {
      ...EMPTY_INPUTS,
      appName: 'Pulse',
      developerName: 'Acme Apps',
      contactEmail: 'privacy@acme.test',
      country: 'Germany',
      platforms: ['ios', 'web'],
      monetization: ['subscription'],
      data: ['email', 'ai_prompts'],
      services: ['stripe', 'gemini'],
      jurisdictions: ['gdpr', 'eu_ai_act'],
      effectiveDate: '2026-11-01',
    };
    const draft = buildDeterministicDraft('privacy', inputs);
    expect(draft.title).toBe('Privacy Policy for Pulse');
    expect(draft.sections.some((s) => s.body.includes('GDPR'))).toBe(true);

    const updated = applyPlaceholderReplacements(draft.sections, {
      '[retention period, e.g. 7 or 10 years for invoices]': '10 years',
    });
    const fullDoc = { kind: 'privacy', title: draft.title, inputs, sections: updated };
    expect(countPlaceholders(fullDoc)).toBe(1); // [Website URL] left unfilled
    const checks = auditLegalDocument(fullDoc, inputs);
    expect(checks.find((c) => c.id === 'contact').ok).toBe(true);
    expect(checks.find((c) => c.id === 'gdpr').ok).toBe(true);
    expect(checks.find((c) => c.id === 'ai').ok).toBe(true);
  });
});
