// Pre-flight Scanner: things that are wrong with a repository before anyone reads the code.
// No AI: file names, workflow settings and (elsewhere) secrets and known-vulnerable packages.
import type { Finding } from './findings.ts';
import { isLockfile } from './lockfiles.ts';

export type TreeEntry = { path: string; type: 'blob' | 'tree'; size?: number };

const finding = (f: Omit<Finding, 'module'>): Finding => ({ module: 'preflight', confidence: 'high', verified: true, ...f });

export function treeChecks(tree: TreeEntry[]): Finding[] {
  const files = tree.filter((e) => e.type === 'blob');
  const paths = files.map((f) => f.path);
  const out: Finding[] = [];

  for (const f of files) {
    const name = f.path.split('/').pop() ?? '';
    if (/^\.env(\..+)?$/.test(name) && !/\.(example|sample|template|dist)$/.test(name)) {
      out.push(finding({ severity: 'high', category: 'secrets', title: `Environment file committed: ${f.path}`, file: f.path, evidence: name, explanation: 'Environment files usually hold keys and passwords. Anyone with access to the repository can read them, and they stay in git history.', fix: 'Remove it from the repository, add it to .gitignore, and rotate every secret it contained.' }));
    }
    if (/\.(pem|p12|pfx|key|p8|jks|keystore)$/i.test(name) || /^id_(rsa|ed25519|ecdsa)$/.test(name)) {
      out.push(finding({ severity: 'critical', category: 'secrets', title: `Key or certificate file committed: ${f.path}`, file: f.path, evidence: name, explanation: 'Private keys in a repository can be used by anyone who can read it.', fix: 'Delete the file, revoke and replace the key, and remove it from git history.' }));
    }
    if ((f.size ?? 0) > 5 * 1024 * 1024 && !/\.(lfs)$/.test(name)) {
      out.push(finding({ severity: 'low', category: 'hygiene', title: `Large file in the repository: ${f.path}`, file: f.path, evidence: `${Math.round((f.size ?? 0) / 1048576)} MB`, explanation: 'Big binaries slow every clone and build.', fix: 'Move it to Git LFS or storage outside the repository.' }));
    }
  }

  if (paths.some((p) => /(^|\/)node_modules\//.test(p))) {
    out.push(finding({ severity: 'medium', category: 'hygiene', title: 'node_modules is committed', evidence: 'node_modules/', explanation: 'Dependencies in the repository bloat it and hide which versions you really use.', fix: 'Delete node_modules from the repository and add it to .gitignore.' }));
  }
  if (paths.includes('package.json') && !paths.some((p) => isLockfile(p))) {
    out.push(finding({ severity: 'medium', category: 'dependencies', title: 'No lockfile next to package.json', file: 'package.json', evidence: 'package.json', explanation: 'Without a lockfile every install can pull different versions, and vulnerable ones can slip in.', fix: 'Commit package-lock.json (or your package manager\'s lockfile).' }));
  }
  if (!paths.includes('.gitignore')) {
    out.push(finding({ severity: 'low', category: 'hygiene', title: 'No .gitignore', evidence: '.gitignore', explanation: 'It\'s easy to commit build output, logs or secrets by accident without one.', fix: 'Add a .gitignore for your language and framework.' }));
  }
  if (!paths.some((p) => /(^|\/)(__tests__|tests?|spec)\//.test(p) || /\.(test|spec)\.[a-z]+$/.test(p) || /(^|\/)test_[^/]+\.py$/.test(p))) {
    out.push(finding({ severity: 'medium', category: 'testing', title: 'No tests found', explanation: 'With no tests, changes made by AI tools are only checked by hand.', fix: 'Add a few tests for the code paths that make or lose money first.' }));
  }
  if (!paths.some((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p) || /^\.gitlab-ci\.yml$|^\.circleci\//.test(p))) {
    out.push(finding({ severity: 'low', category: 'ci', title: 'No continuous integration', explanation: 'Nothing runs your checks automatically on each change.', fix: 'Add a GitHub Actions workflow that installs, lints and tests, and add the VibeAssist Action to it.' }));
  }
  return out;
}

// Risky GitHub Actions settings in one workflow file
export function workflowChecks(path: string, text: string): Finding[] {
  const out: Finding[] = [];
  const lines = text.split('\n');
  const lineOf = (re: RegExp) => lines.findIndex((l) => re.test(l)) + 1 || null;

  if (/^\s*pull_request_target\s*:/m.test(text) || /on:\s*\[?[^\n\]]*pull_request_target/.test(text)) {
    if (/ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.(sha|ref)\s*\}\}/.test(text)) {
      const line = lineOf(/github\.event\.pull_request\.head/);
      out.push(finding({ severity: 'critical', category: 'ci', title: 'pull_request_target checks out the pull request\'s code', file: path, line_start: line, line_end: line, evidence: lines[(line ?? 1) - 1]?.trim(), explanation: 'This runs code from anyone\'s pull request with your repository\'s secrets and write access.', fix: 'Use the pull_request event instead, or don\'t check out the head ref in pull_request_target workflows.' }));
    }
  }
  lines.forEach((raw, i) => {
    const uses = /^\s*-?\s*uses:\s*([^@\s]+)@([^\s#]+)/.exec(raw);
    if (uses && !uses[1].startsWith('./') && !uses[1].startsWith('docker://') && !/^actions\//.test(uses[1]) && !/^[0-9a-f]{40}$/.test(uses[2])) {
      out.push(finding({ severity: 'low', category: 'ci', title: `Third-party action not pinned to a commit: ${uses[1]}@${uses[2]}`, file: path, line_start: i + 1, line_end: i + 1, evidence: raw.trim(), explanation: 'A tag can be moved to different code at any time; a pinned commit can\'t.', fix: `Pin it to the full commit SHA of ${uses[2]}.` }));
    }
    if (/^\s*permissions:\s*write-all\s*$/.test(raw)) {
      out.push(finding({ severity: 'medium', category: 'ci', title: 'Workflow has write access to everything', file: path, line_start: i + 1, line_end: i + 1, evidence: raw.trim(), explanation: 'Any step, including third-party actions, can push code or change settings.', fix: 'Grant only what the job needs, for example permissions: contents: read.' }));
    }
  });
  return out;
}
