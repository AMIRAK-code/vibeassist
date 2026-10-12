// The checks that run inside VibeAssist: Pre-flight Scanner, Red Team and Context & Drift.
import { buildContext, isReviewable } from '../_shared/engine/budget.ts';
import { type Finding, globToRegExp, matchesAny, verifyFinding } from '../_shared/engine/findings.ts';
import { fileContents, getTree, pullFiles } from '../_shared/engine/github.ts';
import { isLockfile, type Package, parseLockfile } from '../_shared/engine/lockfiles.ts';
import { findVulnerabilities } from '../_shared/engine/osv.ts';
import { treeChecks, workflowChecks } from '../_shared/engine/preflight.ts';
import { DRIFT, DRIFT_SCHEMA, RED_TEAM, REVIEW_SCHEMA } from '../_shared/engine/prompts.ts';
import { scanText, shouldScanForSecrets } from '../_shared/engine/secrets.ts';
import { type EngineAi, structuredCall } from '../_shared/engineAi.ts';

export type Log = (level: 'info' | 'ok' | 'warn' | 'error', message: string) => Promise<void>;
export type Ctx = {
  token: string;
  repo: { id: string; full_name: string; settings: Record<string, unknown> };
  sha: string;
  pr: number | null;
  prTitle: string;
  ref: string;
  log: Log;
  // deno-lint-ignore no-explicit-any
  admin: any;
  userId: string;
};
export type ModuleResult = { findings: Finding[]; summary: string; stats: Record<string, unknown>; model?: string | null };

const MAX_SECRET_FILES = 300;
const MAX_SECRET_BYTES = 2_000_000;

export async function runPreflight(ctx: Ctx): Promise<ModuleResult> {
  const { token, repo, sha, log } = ctx;
  const tree = await getTree(token, repo.full_name, sha);
  await log('info', `Read ${tree.entries.length} paths${tree.truncated ? ' (GitHub cut the list short; very large repo)' : ''}`);
  const findings: Finding[] = treeChecks(tree.entries);
  const blobs = tree.entries.filter((e) => e.type === 'blob');

  const workflows = blobs.filter((e) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(e.path)).map((e) => e.path);
  if (workflows.length) {
    const texts = await fileContents(token, repo.full_name, sha, workflows);
    for (const [path, text] of texts) findings.push(...workflowChecks(path, text));
    await log('info', `Checked ${texts.size} workflow file${texts.size === 1 ? '' : 's'}`);
  }

  let budget = MAX_SECRET_BYTES;
  const candidates = blobs.filter((e) => shouldScanForSecrets(e.path, e.size ?? 0)).filter((e) => {
    budget -= e.size ?? 0;
    return budget >= 0;
  }).slice(0, MAX_SECRET_FILES).map((e) => e.path);
  const texts = await fileContents(token, repo.full_name, sha, candidates);
  let secretHits = 0;
  for (const [path, text] of texts) {
    for (const hit of scanText(text)) {
      secretHits++;
      findings.push({
        module: 'preflight', severity: hit.severity as Finding['severity'], category: 'secrets', confidence: 'high', verified: true,
        title: `${hit.title} in ${path}`, file: path, line_start: hit.line, line_end: hit.line, evidence: hit.evidence,
        explanation: 'Anyone who can read the repository, or its history, can use this.',
        fix: 'Remove it from the code, revoke it and create a new one, then remove it from git history (for example with git filter-repo).',
      });
    }
  }
  await log(secretHits ? 'warn' : 'ok', `Scanned ${texts.size} files for secrets: ${secretHits} found`);

  const lockPaths = blobs.filter((e) => isLockfile(e.path) && !/(^|\/)node_modules\//.test(e.path)).map((e) => e.path).slice(0, 10);
  const packages: Package[] = [];
  const unpinned: string[] = [];
  if (lockPaths.length) {
    const lockTexts = await fileContents(token, repo.full_name, sha, lockPaths);
    for (const [path, text] of lockTexts) packages.push(...parseLockfile(path, text, unpinned));
  }
  let vulnCount = 0;
  if (packages.length) {
    try {
      const { vulns, truncated } = await findVulnerabilities(packages);
      vulnCount = vulns.length;
      for (const v of vulns) {
        findings.push({
          module: 'preflight', severity: v.severity, category: 'dependencies', confidence: 'high', verified: true,
          title: `${v.pkg.name}@${v.pkg.version}: ${v.summary}`, file: v.pkg.file, evidence: `${v.pkg.name}@${v.pkg.version}`,
          explanation: `Known vulnerability ${v.id}. Details: https://osv.dev/vulnerability/${v.id}`,
          fix: v.fixed ? `Upgrade ${v.pkg.name} to ${v.fixed} or later.` : `No fixed version yet. Check ${v.id} for a workaround, or replace ${v.pkg.name}.`,
        });
      }
      await log(vulnCount ? 'warn' : 'ok', `Checked ${packages.length} packages on OSV.dev: ${vulnCount} known vulnerabilities${truncated ? ' (first 50 shown)' : ''}`);
    } catch (error) {
      await log('warn', `Couldn't reach OSV.dev, so dependencies weren't checked: ${(error as Error).message}`);
    }
  }
  if (unpinned.length) {
    findings.push({
      module: 'preflight', severity: 'info', category: 'dependencies', confidence: 'high', verified: true,
      title: `${unpinned.length} Python requirement${unpinned.length === 1 ? ' is' : 's are'} not pinned`, file: 'requirements.txt', evidence: unpinned.slice(0, 5).join(', '),
      explanation: 'Without an exact version they can\'t be checked for known vulnerabilities, and installs can change under you.',
      fix: 'Pin exact versions (package==1.2.3), for example with pip-compile.',
    });
  }
  const secrets = findings.filter((f) => f.category === 'secrets').length;
  return {
    findings,
    summary: `${findings.length} issue${findings.length === 1 ? '' : 's'}: ${secrets} about secrets, ${vulnCount} vulnerable package${vulnCount === 1 ? '' : 's'}, ${findings.length - secrets - vulnCount} about setup and workflows.`,
    stats: { paths: tree.entries.length, scanned: texts.size, packages: packages.length, vulnerabilities: vulnCount, secrets },
  };
}

// The files a review reads: a pull request's changed files, or the branch's reviewable files
// (optionally limited by the repo's review paths), riskiest first, within the budget
async function reviewFiles(ctx: Ctx) {
  const { token, repo, sha, pr } = ctx;
  let files: { path: string; changes: number }[];
  if (pr) {
    files = (await pullFiles(token, repo.full_name, pr)).filter((f) => f.status !== 'removed').map((f) => ({ path: f.path, changes: f.changes }));
  } else {
    const globs = Array.isArray(repo.settings.review_paths) ? (repo.settings.review_paths as string[]) : [];
    const tree = await getTree(token, repo.full_name, sha);
    files = tree.entries.filter((e) => e.type === 'blob' && (e.size ?? 0) < 200_000 && isReviewable(e.path) && matchesAny(e.path, globs)).map((e) => ({ path: e.path, changes: 0 }));
  }
  const wanted = files.filter((f) => isReviewable(f.path)).slice(0, 150);
  const texts = await fileContents(token, repo.full_name, sha, wanted.map((f) => f.path));
  const sources = wanted.filter((f) => texts.has(f.path)).map((f) => ({ path: f.path, text: texts.get(f.path)!, changes: f.changes }));
  return { sources, texts, changedCount: files.length };
}

type Review = { summary: string; verdict: string; findings: { title: string; severity: Finding['severity']; category: string; file: string; line_start: number; line_end: number; evidence: string; why: string; fix: string; confidence: 'high' | 'medium' | 'low' }[] };

export async function runRedTeam(ctx: Ctx, ai: EngineAi): Promise<ModuleResult> {
  const { sources, texts, changedCount } = await reviewFiles(ctx);
  const context = buildContext(sources);
  await ctx.log('info', `Reviewing ${context.included.length} of ${changedCount} files (${Math.round(context.chars / 1000)}k characters)${context.skipped.length ? `; ${context.skipped.length} left out` : ''}`);
  if (!context.included.length) return { findings: [], summary: 'Nothing reviewable: every file was generated, vendored or binary.', stats: { included: 0, skipped: context.skipped } };

  const ask = ctx.pr
    ? `Review pull request #${ctx.pr} ("${ctx.prTitle}"). The files below are the changed files at the pull request's head.`
    : `Review the code on ${ctx.ref} below.`;
  await ctx.log('info', 'Security and Architecture reviewers started, isolated from each other');
  const [security, architecture] = await Promise.allSettled([
    structuredCall<Review>(ai, ctx.admin, ctx.userId, [RED_TEAM.security, context.text], ask, REVIEW_SCHEMA),
    structuredCall<Review>(ai, ctx.admin, ctx.userId, [RED_TEAM.architecture, context.text], ask, REVIEW_SCHEMA),
  ]);

  const findings: Finding[] = [];
  const summaries: string[] = [];
  const verdicts: Record<string, string> = {};
  let model: string | null = null;
  for (const [name, result] of [['Security', security], ['Architecture', architecture]] as const) {
    if (result.status === 'rejected') {
      await ctx.log('error', `${name} reviewer failed: ${String((result.reason as Error)?.message ?? result.reason).slice(0, 200)}`);
      continue;
    }
    model = result.value.model;
    if (result.value.refused || !result.value.data) {
      await ctx.log('warn', `${name} reviewer ${result.value.refused ? 'declined to review this code' : 'returned an unreadable answer'}`);
      continue;
    }
    const review = result.value.data;
    verdicts[name.toLowerCase()] = review.verdict;
    summaries.push(`${name}: ${review.summary}`);
    for (const f of review.findings.slice(0, 15)) {
      findings.push(verifyFinding({
        module: 'red_team', severity: f.severity, category: `${name.toLowerCase()}/${f.category}`, title: f.title,
        file: f.file, line_start: f.line_start || null, line_end: f.line_end || null, evidence: f.evidence,
        explanation: f.why, fix: f.fix, confidence: f.confidence,
      }, texts));
    }
    await ctx.log('ok', `${name} reviewer: ${review.findings.length} finding${review.findings.length === 1 ? '' : 's'}, verdict ${review.verdict.replace(/_/g, ' ')}`);
  }
  if (!summaries.length) throw new Error('Neither reviewer could finish. Nothing was saved; try again.');
  const unverified = findings.filter((f) => !f.verified).length;
  if (unverified) await ctx.log('warn', `${unverified} finding${unverified === 1 ? '' : 's'} couldn't be matched to the code and ${unverified === 1 ? 'is' : 'are'} marked unverified`);
  return { findings, summary: summaries.join('\n').slice(0, 2000), stats: { included: context.included.length, skipped: context.skipped.length, verdicts, unverified }, model };
}

type Rule = { id: string; title: string; body: string; kind: string; pattern: string | null; paths: string[]; severity: Finding['severity'] };
type DriftAnswer = { rules: { rule_id: string; status: string; violations: { file: string; line_start: number; line_end: number; evidence: string; fix: string }[] }[] };

export async function runDrift(ctx: Ctx, rules: Rule[], ai: EngineAi | null): Promise<ModuleResult> {
  if (!rules.length) throw new Error('Add at least one rule for this repository first.');
  const tree = await getTree(ctx.token, ctx.repo.full_name, ctx.sha);
  const reviewable = tree.entries.filter((e) => e.type === 'blob' && (e.size ?? 0) < 200_000 && isReviewable(e.path));
  const findings: Finding[] = [];
  const statuses: { id: string; title: string; status: string }[] = [];

  // Pattern rules: checked line by line, no AI
  for (const rule of rules.filter((r) => r.kind !== 'ai')) {
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern ?? '', 'm');
    } catch {
      await ctx.log('error', `Rule "${rule.title}" has a pattern that isn't a valid regular expression; skipped`);
      statuses.push({ id: rule.id, title: rule.title, status: 'unclear' });
      continue;
    }
    const paths = reviewable.filter((e) => matchesAny(e.path, rule.paths)).map((e) => e.path).slice(0, 200);
    const texts = await fileContents(ctx.token, ctx.repo.full_name, ctx.sha, paths);
    let violations = 0;
    for (const [path, text] of texts) {
      if (violations >= 20) break;
      if (rule.kind === 'forbid_pattern') {
        text.split('\n').forEach((line, i) => {
          if (violations < 20 && re.test(line)) {
            violations++;
            findings.push({ module: 'drift', rule_id: rule.id, severity: rule.severity, category: 'rule', title: rule.title, file: path, line_start: i + 1, line_end: i + 1, evidence: line.trim().slice(0, 300), explanation: rule.body, fix: `Remove or change this so it no longer matches /${rule.pattern}/.`, confidence: 'high', verified: true });
          }
        });
      } else if (!re.test(text)) {
        violations++;
        findings.push({ module: 'drift', rule_id: rule.id, severity: rule.severity, category: 'rule', title: rule.title, file: path, evidence: `Missing /${rule.pattern}/`, explanation: rule.body, fix: `Add what the rule requires (it should match /${rule.pattern}/).`, confidence: 'high', verified: true });
      }
    }
    statuses.push({ id: rule.id, title: rule.title, status: violations ? 'violated' : texts.size ? 'followed' : 'not_applicable' });
    await ctx.log(violations ? 'warn' : 'ok', `Rule "${rule.title}": ${violations ? `${violations} violation${violations === 1 ? '' : 's'}` : texts.size ? 'followed' : 'no matching files'}`);
  }

  // Plain-language rules: one Claude call over the files any of them covers
  const aiRules = rules.filter((r) => r.kind === 'ai');
  let model: string | null = null;
  if (aiRules.length) {
    if (!ai) throw new Error('not_configured');
    const paths = reviewable.filter((e) => aiRules.some((r) => matchesAny(e.path, r.paths))).map((e) => e.path).slice(0, 150);
    const texts = await fileContents(ctx.token, ctx.repo.full_name, ctx.sha, paths);
    const context = buildContext([...texts].map(([path, text]) => ({ path, text })));
    const ruleBlock = aiRules.map((r) => `<rule id="${r.id}" severity="${r.severity}" paths="${r.paths.join(', ') || 'everywhere'}">${r.title}: ${r.body}</rule>`).join('\n');
    await ctx.log('info', `Checking ${aiRules.length} written rule${aiRules.length === 1 ? '' : 's'} against ${context.included.length} files`);
    const result = await structuredCall<DriftAnswer>(ai, ctx.admin, ctx.userId, [DRIFT, ruleBlock, context.text], 'Check each rule against the code.', DRIFT_SCHEMA);
    model = result.model;
    if (!result.data) throw new Error(result.refused ? 'Claude declined to check these rules.' : 'The rule check came back unreadable. Try again.');
    for (const r of result.data.rules) {
      const rule = aiRules.find((x) => x.id === r.rule_id);
      if (!rule) continue;
      statuses.push({ id: rule.id, title: rule.title, status: r.status });
      for (const v of r.violations.slice(0, 5)) {
        findings.push(verifyFinding({ module: 'drift', rule_id: rule.id, severity: rule.severity, category: 'rule', title: rule.title, file: v.file, line_start: v.line_start || null, line_end: v.line_end || null, evidence: v.evidence, explanation: rule.body, fix: v.fix, confidence: 'medium' }, texts));
      }
    }
    for (const rule of aiRules.filter((r) => !statuses.some((s) => s.id === r.id))) statuses.push({ id: rule.id, title: rule.title, status: 'unclear' });
  }

  const evaluated = statuses.filter((s) => s.status === 'followed' || s.status === 'violated');
  const violated = statuses.filter((s) => s.status === 'violated').length;
  const driftScore = evaluated.length ? Math.round((violated / evaluated.length) * 100) : 0;
  return {
    findings,
    summary: `${violated} of ${evaluated.length} checked rule${evaluated.length === 1 ? '' : 's'} broken (drift ${driftScore}%).`,
    stats: { rules: statuses, drift_score: driftScore },
    model,
  };
}

// Paths whose rules suggestions are built from
export const NOTES = /^(CLAUDE\.md|AGENTS\.md|\.cursorrules|\.cursor\/rules\/.+|docs\/architecture[^/]*\.md|ARCHITECTURE\.md|README\.md)$/i;
export const isGlob = (text: string) => { try { globToRegExp(text); return true; } catch { return false; } };
