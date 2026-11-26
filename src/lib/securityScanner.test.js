import { describe, expect, it } from 'vitest';
import {
  auditResponseHeaders, buildSecurityHeadersConfig, parseDependenciesText, scanSecretsInText,
} from './securityScanner';

describe('scanSecretsInText', () => {
  it('detects leaked provider, Stripe, and PEM keys while masking previews', () => {
    const fakeOpenAi = ['sk', 'proj', '1234567890abcdefghijklmnop'].join('-');
    const fakeStripe = ['sk', 'live', '51AbCdEfGhIjKlMnOpQrStUvWx'].join('_');
    const sample = [
      'VITE_SUPABASE_URL=https://demo.supabase.co',
      `OPENAI_KEY=${fakeOpenAi}`,
      `STRIPE_LIVE=${fakeStripe}`,
      '-----BEGIN PRIVATE KEY-----',
    ].join('\n');

    const { findings, scannedLines } = scanSecretsInText(sample, '.env');
    expect(scannedLines).toBe(4);
    expect(findings.length).toBe(3);
    expect(findings.map((f) => f.ruleId)).toEqual(['openai_key', 'stripe_secret', 'private_key_block']);
    expect(findings[0].preview).not.toContain('1234567890abcdefghijklmnop');
  });

  it('returns zero findings for safe example configs', () => {
    const clean = 'VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_123456\nAPI_KEY=your_api_key_placeholder';
    expect(scanSecretsInText(clean).findings).toEqual([]);
  });
});

describe('parseDependenciesText', () => {
  it('parses package.json, package-lock.json, and requirements.txt', () => {
    const pkg = parseDependenciesText('{"dependencies":{"react":"^19.2.8","lodash":"~4.17.21"}}');
    expect(pkg.ecosystem).toBe('npm');
    expect(pkg.packages).toEqual([
      { name: 'react', version: '19.2.8', ecosystem: 'npm' },
      { name: 'lodash', version: '4.17.21', ecosystem: 'npm' },
    ]);

    const lock = parseDependenciesText('{"packages":{"node_modules/axios":{"version":"1.7.7"}}}');
    expect(lock.packages).toEqual([{ name: 'axios', version: '1.7.7', ecosystem: 'npm' }]);

    const py = parseDependenciesText('fastapi==0.115.0\n# comment\nuvicorn==0.30.0');
    expect(py.ecosystem).toBe('PyPI');
    expect(py.packages.length).toBe(2);
  });
});

describe('security headers generator & auditor', () => {
  it('generates Cloudflare, Vercel, and Netlify header configs and audits curl headers', () => {
    const cfg = buildSecurityHeadersConfig({ allowAiHosts: true, allowFrame: false });
    expect(cfg.cloudflare).toContain('Strict-Transport-Security');
    expect(cfg.cloudflare).toContain('generativelanguage.googleapis.com');
    expect(cfg.vercel).toContain('"X-Frame-Options"');
    expect(cfg.netlify).toContain('[[headers]]');

    const checks = auditResponseHeaders('HTTP/2 200\nx-content-type-options: nosniff\n');
    expect(checks.find((c) => c.key === 'x-content-type-options').ok).toBe(true);
    expect(checks.find((c) => c.key === 'strict-transport-security').ok).toBe(false);
  });
});
