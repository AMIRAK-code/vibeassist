// Shared shape and checks for everything the engine reports.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Finding = {
  module: string;
  severity: Severity;
  category?: string;
  title: string;
  file?: string | null;
  line_start?: number | null;
  line_end?: number | null;
  evidence?: string | null;
  explanation?: string | null;
  fix?: string | null;
  confidence?: 'high' | 'medium' | 'low';
  verified?: boolean;
  rule_id?: string | null;
};

export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const clip = (text: unknown, max: number) => (text === null || text === undefined ? null : String(text).slice(0, max));
const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Same problem in the same place gives the same fingerprint across runs, even if line numbers
// shift, so runs can say what's new, still open, or fixed
export function fingerprint(f: Finding) {
  return sha256([f.module, f.rule_id ?? '', f.file ?? '', normalise(f.evidence ?? f.title).toLowerCase()].join('|'));
}

// Claude's findings are only trusted as far as they can be checked: the file must be one it was
// shown, the lines must exist, and the quoted evidence must really be in those lines
export function verifyFinding(f: Finding, files: Map<string, string>): Finding {
  const text = f.file ? files.get(f.file) : undefined;
  if (!text) return { ...f, verified: false, confidence: 'low' };
  const lines = text.split('\n');
  const start = Math.max(1, Number(f.line_start) || 0);
  const end = Math.max(start, Number(f.line_end) || start);
  if (!f.line_start || start > lines.length) return { ...f, line_start: null, line_end: null, verified: false, confidence: 'low' };
  const window = normalise(lines.slice(Math.max(0, start - 3), Math.min(lines.length, end + 2)).join(' '));
  const evidence = normalise(f.evidence ?? '');
  const found = !evidence || window.includes(evidence) || normalise(text).includes(evidence);
  return found
    ? { ...f, line_start: start, line_end: end, verified: true }
    : { ...f, line_start: start, line_end: end, verified: false, confidence: f.confidence === 'high' ? 'medium' : 'low' };
}

// Ready to insert: lengths capped, unknown severities made "medium", duplicates dropped
export async function prepareFindings(findings: Finding[], extra: { run_id: string; user_id: string; repo_id: string }) {
  const seen = new Set<string>();
  const rows = [];
  for (const f of findings) {
    const fp = await fingerprint(f);
    if (seen.has(fp)) continue;
    seen.add(fp);
    rows.push({
      ...extra,
      module: f.module,
      rule_id: f.rule_id ?? null,
      severity: SEVERITIES.includes(f.severity) ? f.severity : 'medium',
      category: clip(f.category, 60),
      title: clip(f.title, 200) ?? 'Finding',
      file: clip(f.file, 500),
      line_start: f.line_start ?? null,
      line_end: f.line_end ?? null,
      evidence: clip(f.evidence, 600),
      explanation: clip(f.explanation, 2000),
      fix: clip(f.fix, 2000),
      confidence: f.confidence ?? 'high',
      verified: f.verified ?? true,
      fingerprint: fp,
    });
  }
  return rows;
}

// Fail on anything critical or high, warn on medium, pass otherwise
export function outcomeOf(findings: { severity: string }[]) {
  if (findings.some((f) => f.severity === 'critical' || f.severity === 'high')) return 'fail';
  if (findings.some((f) => f.severity === 'medium')) return 'warn';
  return 'pass';
}

// What changed since the previous run of the same module on the same repo
export function compareRuns(current: string[], previous: string[]) {
  const before = new Set(previous);
  const now = new Set(current);
  return {
    new: current.filter((fp) => !before.has(fp)).length,
    still_open: current.filter((fp) => before.has(fp)).length,
    resolved: previous.filter((fp) => !now.has(fp)).length,
  };
}

// "src/**/*.ts" -> RegExp. ** crosses folders, * and ? stay inside one.
export function globToRegExp(glob: string) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matchesAny = (path: string, globs: string[]) => !globs.length || globs.some((g) => globToRegExp(g).test(path));
