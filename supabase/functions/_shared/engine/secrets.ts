// Finds secrets committed to a repository. Evidence is always redacted before it is stored or
// shown, and the matching runs without any AI.
import catalog from './secret-patterns.json' with { type: 'json' };

export type SecretHit = { id: string; title: string; severity: string; line: number; evidence: string };

type Pattern = { id: string; title: string; severity: string; regex: string; flags?: string; entropy?: number };
const PATTERNS = (catalog.patterns as Pattern[]).map((p) => ({ ...p, re: new RegExp(p.regex, `g${p.flags ?? ''}`) }));

// Shannon entropy in bits per character: random keys score high, words and placeholders low
export function entropy(text: string) {
  const counts = new Map<string, number>();
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

// "sk_live_abcdef123…" -> "sk_l…": enough to recognise, never enough to use
export const redact = (secret: string) => `${secret.slice(0, 4)}…`;

// A Supabase service-role key in the source: the JWT payload says role=service_role
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
function serviceRoleJwt(line: string) {
  for (const match of line.matchAll(JWT)) {
    try {
      const payload = JSON.parse(atob(match[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload?.role === 'service_role') return match[0];
    } catch {
      // not a JWT after all
    }
  }
  return null;
}

const PLACEHOLDER = /(x{6,}|\*{4,}|example|placeholder|your[_-]?(key|token|secret)|changeme|<[^>]+>|\$\{)/i;

export function scanText(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 2000) continue; // minified or data lines
    const service = serviceRoleJwt(line);
    if (service) hits.push({ id: 'supabase_service_role', title: 'Supabase service-role key', severity: 'critical', line: i + 1, evidence: redact(service) });
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      for (const match of line.matchAll(p.re)) {
        const value = match[0];
        if (PLACEHOLDER.test(value)) continue;
        if (p.entropy) {
          const quoted = /['"]([^'"]+)['"]/.exec(value)?.[1] ?? value;
          if (entropy(quoted) < p.entropy) continue;
        }
        hits.push({ id: p.id, title: p.title, severity: p.severity, line: i + 1, evidence: redact(value) });
      }
    }
  }
  return hits;
}

// Files worth scanning for secrets: text, not vendored or generated, and not too big
export function shouldScanForSecrets(path: string, size: number) {
  if (size > 200_000) return false;
  if (/(^|\/)(node_modules|vendor|dist|build|\.next|coverage|\.git)\//.test(path)) return false;
  if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp4|mov|lock|min\.js|map|svg)$/i.test(path)) return false;
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)) return false;
  return true;
}
