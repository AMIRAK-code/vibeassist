// Mutation Validator: changes the code under test in small ways (mutants) and checks the tests
// notice. Tests that keep passing when the code is broken are "tautological": they can't fail.
// JS/TS uses Stryker (vitest or jest); Python uses mutmut 3. Only changed files are mutated, and
// the whole step is time-boxed. Also flags test files with no assertions at all.
import { existsSync, readFileSync } from 'node:fs';
import { changedFiles, context, env, git, report, run } from './lib.mjs';

const ctx = context();
const minutes = Number(env('MUTATE_TIMEOUT_MINUTES', '15'));
const timeoutMs = minutes * 60_000;
const findings = [];
const log = [];

const isTest = (p) => /(\.|_)(test|spec)\.[cm]?[jt]sx?$|(^|\/)(__tests__|tests?)\/|(^|\/)test_[^/]+\.py$|_test\.py$/.test(p);
const isSource = (p) => /\.[cm]?[jt]sx?$|\.py$/.test(p) && !isTest(p) && !/(^|\/)(node_modules|dist|build|vendor)\//.test(p) && !/\.(config|d)\.[cm]?[jt]s$/.test(p);

let changed = changedFiles(ctx);
if (!changed.length) changed = git('ls-files').split('\n').filter(Boolean).slice(0, 2000);
const sources = changed.filter(isSource).slice(0, 25);

// Tests that can't fail: no assertion in the file, or assertions that compare constants
for (const file of changed.filter(isTest).filter((f) => existsSync(f))) {
  const text = readFileSync(file, 'utf8');
  const hasTests = /\b(it|test)\s*\(|^\s*def test_/m.test(text);
  const asserts = /\bexpect\s*\(|\bassert\b|\bshould\b|toMatchSnapshot|self\.assert/.test(text);
  if (hasTests && !asserts) findings.push({ severity: 'high', category: 'tautology', title: 'Test file has no assertions', file, explanation: 'These tests pass whatever the code does.', fix: 'Assert on the result of the code under test.' });
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/expect\s*\(\s*(true|false|1|0|null|'[^']*'|"[^"]*")\s*\)\s*\.\s*(toBe|toEqual)\s*\(\s*\1\s*\)|assert\s+True\b(?!\s*==)/.test(line)) {
      findings.push({ severity: 'medium', category: 'tautology', title: 'Assertion compares a constant with itself', file, line_start: i + 1, line_end: i + 1, evidence: line.trim().slice(0, 200), explanation: 'This assertion is always true.', fix: 'Assert on a value produced by the code under test.' });
    }
  });
}

let summary = '';
let status = 'succeeded';
const stats = { mutated_files: sources.length };
const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : null;
const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
const jsSources = sources.filter((p) => !p.endsWith('.py'));
const pySources = sources.filter((p) => p.endsWith('.py'));

if (!sources.length) {
  status = 'skipped';
  summary = 'No changed source files to mutate.';
} else if (jsSources.length && (deps.vitest || deps.jest)) {
  const runner = deps.vitest ? 'vitest' : 'jest';
  log.push(`Stryker with the ${runner} runner on ${jsSources.length} file(s)`);
  const result = run('npx', ['--yes', '-p', '@stryker-mutator/core@8', '-p', `@stryker-mutator/${runner}-runner@8`, 'stryker', 'run',
    '--testRunner', runner, '--reporters', 'json,clear-text', '--mutate', jsSources.join(','), '--incremental'], { timeoutMs });
  const reportPath = 'reports/mutation/mutation.json';
  if (result.timedOut) {
    status = 'skipped';
    summary = `Stopped after ${minutes} minutes; mutate fewer files or raise mutate-timeout-minutes.`;
  } else if (existsSync(reportPath)) {
    const data = JSON.parse(readFileSync(reportPath, 'utf8'));
    let killed = 0;
    let survived = 0;
    for (const [file, info] of Object.entries(data.files ?? {})) {
      for (const m of info.mutants ?? []) {
        if (m.status === 'Killed' || m.status === 'Timeout') killed++;
        if (m.status === 'Survived' || m.status === 'NoCoverage') {
          survived++;
          if (findings.length < 150) {
            findings.push({
              severity: m.status === 'NoCoverage' ? 'low' : 'medium', category: 'surviving-mutant',
              title: `${m.status === 'NoCoverage' ? 'Untested' : 'Survived'}: ${m.mutatorName}${m.replacement ? ` → ${String(m.replacement).slice(0, 60)}` : ''}`,
              file, line_start: m.location?.start?.line ?? null, line_end: m.location?.end?.line ?? null,
              evidence: String(m.replacement ?? '').slice(0, 200),
              explanation: m.status === 'NoCoverage' ? 'No test runs this code.' : 'The tests still pass with this change, so they don\'t check this behaviour.',
              fix: 'Add or tighten a test so this change makes it fail.',
            });
          }
        }
      }
    }
    const score = killed + survived ? Math.round((killed / (killed + survived)) * 100) : null;
    Object.assign(stats, { killed, survived, score });
    summary = score === null ? 'Stryker produced no mutants.' : `Mutation score ${score}% (${killed} caught, ${survived} survived).`;
  } else {
    status = 'failed';
    summary = 'Stryker didn\'t produce a report. Check that the tests pass on their own first.';
    log.push(result.out.slice(-280));
  }
} else if (pySources.length && (existsSync('pyproject.toml') || existsSync('setup.cfg') || existsSync('pytest.ini'))) {
  log.push(`mutmut on ${pySources.length} file(s)`);
  run('pip', ['install', '--quiet', 'mutmut>=3,<4'], { timeoutMs: 120_000 });
  const result = run('mutmut', ['run', ...pySources], { timeoutMs });
  const results = run('mutmut', ['results'], { timeoutMs: 60_000 }).out;
  const survivedNames = [...results.matchAll(/^\s*([\w.]+__mutmut_\d+): survived/gm)].map((m) => m[1]);
  stats.survived = survivedNames.length;
  for (const name of survivedNames.slice(0, 150)) {
    findings.push({ severity: 'medium', category: 'surviving-mutant', title: `Survived: ${name}`, file: name.split('.x_')[0].replace(/\./g, '/') + '.py', explanation: 'The tests still pass with this change.', fix: `Run "mutmut show ${name}" and add a test that catches it.` });
  }
  if (result.timedOut) {
    status = 'skipped';
    summary = `Stopped after ${minutes} minutes.`;
  } else {
    summary = `${survivedNames.length} mutant${survivedNames.length === 1 ? '' : 's'} survived.`;
  }
} else {
  status = 'skipped';
  summary = 'No supported test runner found (vitest or jest for JavaScript, pytest for Python).';
}

await report({
  repo: ctx.repo, sha: ctx.sha, ref: ctx.ref, pr_number: ctx.prNumber, run_url: ctx.runUrl, module: 'mutation',
  status, summary: summary + (findings.some((f) => f.category === 'tautology') ? ' Some tests can never fail.' : ''), stats, log, findings,
});
