// Shared helpers for the VibeAssist Engine action. Node 20+, no dependencies.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

export const env = (name, fallback = '') => process.env[name] ?? fallback;

export function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function run(cmd, args, { timeoutMs, cwd } = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, cwd, shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  return { code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}`, timedOut: result.error?.code === 'ETIMEDOUT' };
}

// Where this run sits: repo, commit, branch, pull request and a link back to the run
export function context() {
  const event = existsSync(env('GITHUB_EVENT_PATH')) ? JSON.parse(readFileSync(env('GITHUB_EVENT_PATH'), 'utf8')) : {};
  const pr = event.pull_request ?? null;
  return {
    repo: env('GITHUB_REPOSITORY'),
    sha: pr?.head?.sha ?? env('GITHUB_SHA'),
    ref: pr?.head?.ref ?? env('GITHUB_REF_NAME'),
    baseSha: pr?.base?.sha ?? event.before ?? null,
    prNumber: pr?.number ?? null,
    defaultBranch: event.repository?.default_branch ?? 'main',
    eventName: env('GITHUB_EVENT_NAME'),
    runUrl: `${env('GITHUB_SERVER_URL', 'https://github.com')}/${env('GITHUB_REPOSITORY')}/actions/runs/${env('GITHUB_RUN_ID')}`,
  };
}

// Files changed in this pull request or push (empty when it can't be worked out)
export function changedFiles(ctx) {
  if (!ctx.baseSha || /^0+$/.test(ctx.baseSha)) return [];
  try {
    return git('diff', '--name-only', '--diff-filter=AMR', `${ctx.baseSha}...${ctx.sha}`).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// Sends the result to VibeAssist and writes it to the job summary
export async function report(payload) {
  const key = env('VIBEASSIST_KEY');
  const api = env('VIBEASSIST_API', 'https://thwxxgibcbxkfodzoedb.supabase.co/functions/v1').replace(/\/$/, '');
  const summaryLines = [`### VibeAssist · ${payload.module}`, '', payload.summary || '', ''];
  for (const f of (payload.findings ?? []).slice(0, 20)) summaryLines.push(`- **${f.severity}** ${f.title}${f.file ? ` (\`${f.file}${f.line_start ? `:${f.line_start}` : ''}\`)` : ''}`);
  if (env('GITHUB_STEP_SUMMARY')) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(env('GITHUB_STEP_SUMMARY'), `${summaryLines.join('\n')}\n\n`);
  }
  if (!key) {
    console.log('::warning::VIBEASSIST_KEY is not set, so the result was not sent to VibeAssist.');
    return null;
  }
  if (env('GITHUB_EVENT_NAME') === 'pull_request' && env('GITHUB_HEAD_REPO_FORK') === 'true') {
    console.log('Pull request from a fork: secrets are not available, so nothing is sent.');
    return null;
  }
  const res = await fetch(`${api}/engine-ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`::warning::VibeAssist didn't accept the report (${res.status}): ${body.error ?? 'unknown error'}`);
    return null;
  }
  console.log(`Sent to VibeAssist: ${body.url}`);
  return body;
}
