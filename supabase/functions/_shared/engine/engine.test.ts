import { afterEach, describe, expect, it, vi } from 'vitest';
import { entropy, scanText, shouldScanForSecrets } from './secrets.ts';
import { parseLockfile } from './lockfiles.ts';
import { findVulnerabilities } from './osv.ts';
import { compareRuns, fingerprint, globToRegExp, matchesAny, outcomeOf, prepareFindings, verifyFinding } from './findings.ts';
import { treeChecks, workflowChecks } from './preflight.ts';
import { buildContext, isReviewable, rankFiles } from './budget.ts';
import { checkToken, GitHubError } from './github.ts';
import { errorBody, shouldFallback, upstreamRequest, usageFromStream, validateTargets } from './gatewayRouting.ts';
import enginePatterns from './secret-patterns.json' with { type: 'json' };
import actionPatterns from '../../../../github-action/scripts/secret-patterns.json' with { type: 'json' };

afterEach(() => vi.unstubAllGlobals());

// Built at runtime so the repository itself never contains something that looks like a real key
const fake = {
  aws: 'AKIA' + 'Q'.repeat(16),
  stripe: 'sk_live_' + 'a1B2c3D4'.repeat(4),
  github: 'ghp_' + 'Ab1'.repeat(12),
  pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
};

describe('secret scanning', () => {
  it('finds real-looking keys, redacts them and gives the line', () => {
    const hits = scanText(`const a = 1;\nconst aws = "${fake.aws}";\nSTRIPE=${fake.stripe}\n${fake.pem}\ntoken: ${fake.github}`);
    expect(hits.map((h) => [h.id, h.line])).toEqual([['aws_access_key', 2], ['stripe_secret', 3], ['private_key', 4], ['github_token', 5]]);
    expect(hits.every((h) => h.evidence.endsWith('…') && h.evidence.length <= 5)).toBe(true);
  });

  it('ignores placeholders and low-entropy passwords, but flags random ones', () => {
    expect(scanText('password = "your_password_here"')).toEqual([]);
    expect(scanText('password = "aaaaaaaaaaaaaaaa"')).toEqual([]);
    expect(scanText('api_key = "Zx8Qp2Lr9Wt4Vb7N"')[0]?.id).toBe('generic_secret');
    expect(entropy('aaaa')).toBe(0);
  });

  it('spots a Supabase service-role key and secrets in public env variables', () => {
    const payload = btoa(JSON.stringify({ role: 'service_role', iss: 'supabase' })).replace(/=+$/, '');
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.${'s'.repeat(20)}`;
    expect(scanText(`const key = '${jwt}'`)[0]?.id).toBe('supabase_service_role');
    expect(scanText('VITE_SUPABASE_SERVICE_ROLE_KEY=abc')[0]?.id).toBe('client_secret_env');
    expect(shouldScanForSecrets('node_modules/x/index.js', 10)).toBe(false);
    expect(shouldScanForSecrets('src/config.ts', 10)).toBe(true);
  });

  it('uses the same patterns as the GitHub Action', () => {
    expect(actionPatterns).toEqual(enginePatterns);
  });
});

describe('lockfiles', () => {
  it('reads npm, pnpm, yarn and Python pins', () => {
    const npm = parseLockfile('package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'app' }, 'node_modules/lodash': { version: '4.17.15' }, 'node_modules/a/node_modules/@scope/b': { version: '1.0.0' } } }));
    expect(npm.map((p) => `${p.name}@${p.version}`)).toEqual(['lodash@4.17.15', '@scope/b@1.0.0']);
    expect(parseLockfile('pnpm-lock.yaml', "packages:\n  /lodash@4.17.21:\n    resolution: x\n  '@vue/shared@3.4.0':\n").map((p) => p.name)).toEqual(['lodash', '@vue/shared']);
    expect(parseLockfile('yarn.lock', 'lodash@^4.17.0:\n  version "4.17.15"\n  resolved "x"\n')[0]).toMatchObject({ name: 'lodash', version: '4.17.15' });
    const unpinned: string[] = [];
    expect(parseLockfile('requirements.txt', 'django==3.2.0\nrequests>=2\n# comment\n', unpinned).map((p) => p.name)).toEqual(['django']);
    expect(unpinned).toEqual(['requests']);
  });

  it('reads Go, Rust, Ruby and PHP lockfiles', () => {
    expect(parseLockfile('go.sum', 'golang.org/x/net v0.17.0 h1:x=\ngolang.org/x/net v0.17.0/go.mod h1:y=\n')).toEqual([{ ecosystem: 'Go', name: 'golang.org/x/net', version: '0.17.0', file: 'go.sum' }]);
    expect(parseLockfile('Cargo.lock', '[[package]]\nname = "serde"\nversion = "1.0.0"\n')[0]).toMatchObject({ ecosystem: 'crates.io', name: 'serde' });
    expect(parseLockfile('Gemfile.lock', 'GEM\n  specs:\n    rails (7.0.0)\n      actionpack (= 7.0.0)\n\nPLATFORMS\n')).toEqual([{ ecosystem: 'RubyGems', name: 'rails', version: '7.0.0', file: 'Gemfile.lock' }]);
    expect(parseLockfile('composer.lock', JSON.stringify({ packages: [{ name: 'monolog/monolog', version: 'v2.0.0' }] }))[0].version).toBe('2.0.0');
    expect(parseLockfile('package-lock.json', 'not json')).toEqual([]);
  });

  it('looks packages up on OSV and reads severity and the fixed version', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ vulns: [{ id: 'GHSA-1' }] }, {}] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ summary: 'Prototype pollution', database_specific: { severity: 'HIGH' }, affected: [{ package: { name: 'lodash' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '4.17.19' }] }] }] })));
    const result = await findVulnerabilities([
      { ecosystem: 'npm', name: 'lodash', version: '4.17.15', file: 'package-lock.json' },
      { ecosystem: 'npm', name: 'react', version: '18.0.0', file: 'package-lock.json' },
    ], fetchFn);
    expect(result.vulns).toEqual([{ pkg: expect.objectContaining({ name: 'lodash' }), id: 'GHSA-1', summary: 'Prototype pollution', severity: 'high', fixed: '4.17.19' }]);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).queries[0]).toEqual({ package: { ecosystem: 'npm', name: 'lodash' }, version: '4.17.15' });
  });
});

describe('findings', () => {
  const files = new Map([['src/db.ts', 'const a = 1;\nconst q = "SELECT * FROM users WHERE id = " + id;\nreturn db.query(q);']]);

  it('verifies Claude\'s findings against the files it was shown', () => {
    const base = { module: 'red_team', severity: 'high' as const, title: 'SQL injection', file: 'src/db.ts', line_start: 2, line_end: 2, confidence: 'high' as const };
    expect(verifyFinding({ ...base, evidence: 'const q = "SELECT * FROM users WHERE id = " + id;' }, files).verified).toBe(true);
    expect(verifyFinding({ ...base, evidence: 'exec(userInput)' }, files)).toMatchObject({ verified: false, confidence: 'medium' });
    expect(verifyFinding({ ...base, file: 'src/missing.ts', evidence: 'x' }, files)).toMatchObject({ verified: false, confidence: 'low' });
    expect(verifyFinding({ ...base, line_start: 99, evidence: 'x' }, files).line_start).toBeNull();
  });

  it('fingerprints stay the same when only line numbers or spacing change', async () => {
    const a = await fingerprint({ module: 'preflight', severity: 'high', title: 't', file: 'a.ts', line_start: 3, evidence: 'const  x = 1' });
    const b = await fingerprint({ module: 'preflight', severity: 'high', title: 't', file: 'a.ts', line_start: 9, evidence: 'const x = 1' });
    expect(a).toBe(b);
    const rows = await prepareFindings([
      { module: 'preflight', severity: 'high', title: 't', file: 'a.ts', evidence: 'x' },
      { module: 'preflight', severity: 'high', title: 't', file: 'a.ts', evidence: 'x' },
      { module: 'preflight', severity: 'bogus' as never, title: 'u' },
    ], { run_id: 'r', user_id: 'u', repo_id: 'p' });
    expect(rows).toHaveLength(2);
    expect(rows[1].severity).toBe('medium');
  });

  it('works out the outcome and what changed since last time', () => {
    expect(outcomeOf([{ severity: 'low' }, { severity: 'high' }])).toBe('fail');
    expect(outcomeOf([{ severity: 'medium' }])).toBe('warn');
    expect(outcomeOf([])).toBe('pass');
    expect(compareRuns(['a', 'b'], ['b', 'c'])).toEqual({ new: 1, still_open: 1, resolved: 1 });
  });

  it('matches globs the way people write them', () => {
    expect(globToRegExp('src/**/*.ts').test('src/a/b/c.ts')).toBe(true);
    expect(globToRegExp('src/**/*.ts').test('src/c.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/a/c.ts')).toBe(false);
    expect(matchesAny('lib/x.py', [])).toBe(true);
    expect(matchesAny('lib/x.py', ['src/**'])).toBe(false);
  });
});

describe('pre-flight checks', () => {
  it('flags committed env files and keys, a missing lockfile, no tests and no CI', () => {
    const titles = treeChecks([
      { path: '.env', type: 'blob' }, { path: '.env.example', type: 'blob' }, { path: 'certs/server.pem', type: 'blob' },
      { path: 'package.json', type: 'blob' }, { path: 'src/index.js', type: 'blob' },
    ]).map((f) => f.title);
    expect(titles).toEqual([
      'Environment file committed: .env', 'Key or certificate file committed: certs/server.pem',
      'No lockfile next to package.json', 'No .gitignore', 'No tests found', 'No continuous integration',
    ]);
    expect(treeChecks([{ path: '.gitignore', type: 'blob' }, { path: 'src/a.test.ts', type: 'blob' }, { path: '.github/workflows/ci.yml', type: 'blob' }])).toEqual([]);
  });

  it('flags dangerous workflow settings', () => {
    const yaml = 'on:\n  pull_request_target:\njobs:\n  build:\n    permissions: write-all\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - uses: some/action@v1\n      - uses: other/action@' + 'a'.repeat(40) + '\n';
    const found = workflowChecks('.github/workflows/pr.yml', yaml);
    expect(found.map((f) => [f.severity, f.line_start])).toEqual([['critical', 9], ['medium', 5], ['low', 10]]);
  });
});

describe('review budget', () => {
  it('reads risky changed files first and skips generated ones within the limit', () => {
    const files = [
      { path: 'README.md', text: 'hi', changes: 50 },
      { path: 'src/auth/session.ts', text: 'a\nb', changes: 2 },
      { path: 'dist/app.min.js', text: 'x', changes: 900 },
      { path: 'src/big.ts', text: 'y'.repeat(500), changes: 1 },
    ];
    expect(rankFiles(files)[0].path).toBe('src/auth/session.ts');
    const ctx = buildContext(files, 200);
    expect(ctx.included).toEqual(['src/auth/session.ts', 'README.md']);
    expect(ctx.skipped.map((s) => s.path).sort()).toEqual(['dist/app.min.js', 'src/big.ts']);
    expect(ctx.text).toContain('<file path="src/auth/session.ts" lines="2">\n    1  a\n    2  b\n</file>');
    expect(isReviewable('pnpm-lock.yaml')).toBe(false);
  });
});

describe('GitHub token', () => {
  it('only accepts fine-grained tokens and reads the expiry', async () => {
    await expect(checkToken('ghp_' + 'x'.repeat(36))).rejects.toBeInstanceOf(GitHubError);
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ login: 'faraz' }), { headers: { 'github-authentication-token-expiration': '2026-12-31 10:00:00 UTC' } }));
    expect(await checkToken('github_pat_' + 'A'.repeat(70), fetchFn)).toEqual({ login: 'faraz', expiresAt: '2026-12-31T10:00:00.000Z' });
  });
});

describe('token gateway', () => {
  it('falls back only on errors another provider could avoid', () => {
    expect([429, 500, 529, 408].every(shouldFallback)).toBe(true);
    expect([400, 401, 403, 404].some(shouldFallback)).toBe(false);
  });

  it('builds provider requests with the right auth and asks streams for usage', () => {
    const anthropic = upstreamRequest('anthropic', 'sk-a', { messages: [], model: 'smart' }, 'claude-opus-5-5');
    expect(anthropic.url).toBe('https://api.anthropic.com/v1/messages');
    expect(anthropic.init.headers).toMatchObject({ 'x-api-key': 'sk-a', 'anthropic-version': '2023-06-01' });
    expect(JSON.parse(anthropic.init.body).model).toBe('claude-opus-5-5');
    const openai = upstreamRequest('groq', 'gk', { stream: true, model: 'fast' }, 'llama-3.3-70b');
    expect(openai.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(JSON.parse(openai.init.body).stream_options).toEqual({ include_usage: true });
  });

  it('reads usage from streams in both formats', () => {
    expect(usageFromStream('anthropic', 'data: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":34}}\n')).toEqual({ input: 12, output: 34 });
    expect(usageFromStream('openai', 'data: {"choices":[]}\n\ndata: {"usage":{"prompt_tokens":5,"completion_tokens":7}}\n\ndata: [DONE]\n')).toEqual({ input: 5, output: 7 });
  });

  it('checks a route\'s targets speak its format and shapes errors for each SDK', () => {
    expect(validateTargets('openai', [{ provider: 'anthropic', model: 'x' }])).toMatch(/doesn't speak/);
    expect(validateTargets('openai', [{ provider: 'openrouter', model: 'anthropic/claude-sonnet' }])).toBeNull();
    expect(errorBody('anthropic', 429, 'slow down')).toEqual({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } });
  });
});
