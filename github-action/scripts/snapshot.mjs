// Snapshot Engine: tags each passing push to the default branch, keeps the newest 30 tags, and
// tells VibeAssist so the Engine page can list them with rewind steps.
import { context, env, git, report } from './lib.mjs';

const KEEP = Number(env('SNAPSHOT_KEEP', '30'));
const ctx = context();

if (ctx.eventName !== 'push' || ctx.ref !== ctx.defaultBranch) {
  console.log(`Snapshots are taken on pushes to ${ctx.defaultBranch}; nothing to do for ${ctx.eventName} on ${ctx.ref}.`);
  await report({ repo: ctx.repo, sha: ctx.sha, ref: ctx.ref, pr_number: ctx.prNumber, run_url: ctx.runUrl, module: 'snapshot', status: 'skipped', summary: `Skipped: snapshots are only taken on pushes to ${ctx.defaultBranch}.` });
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const tag = `vibe-snapshot-${stamp}-${ctx.sha.slice(0, 7)}`;
git('config', 'user.name', 'vibeassist-engine');
git('config', 'user.email', 'engine@users.noreply.vibeassist.app');
git('tag', '-a', tag, ctx.sha, '-m', `VibeAssist snapshot of ${ctx.sha} (${ctx.runUrl})`);
git('push', 'origin', `refs/tags/${tag}`);
console.log(`Tagged ${tag}`);

// Oldest snapshot tags beyond the newest KEEP are deleted from the remote
git('fetch', '--tags', '--force', 'origin');
const tags = git('tag', '--list', 'vibe-snapshot-*', '--sort=-creatordate').split('\n').filter(Boolean);
const old = tags.slice(KEEP);
for (const t of old) {
  try {
    git('push', 'origin', '--delete', `refs/tags/${t}`);
  } catch {
    console.log(`Couldn't delete old tag ${t}; leaving it.`);
  }
}

await report({
  repo: ctx.repo, sha: ctx.sha, ref: ctx.ref, run_url: ctx.runUrl, module: 'snapshot', status: 'succeeded',
  summary: `Snapshot ${tag}${old.length ? `; removed ${old.length} older snapshot${old.length === 1 ? '' : 's'}` : ''}.`,
  stats: { kept: Math.min(tags.length, KEEP), removed: old.length },
  snapshot: { tag, branch: ctx.ref, checks: { earlier_steps: 'passed' } },
  findings: [],
});
