// Known vulnerabilities for exact package versions, from OSV.dev (free, no key).
import type { Package } from './lockfiles.ts';

export type Vulnerability = { pkg: Package; id: string; summary: string; severity: 'critical' | 'high' | 'medium' | 'low'; fixed: string | null };

const BATCH = 1000;
const MAX_DETAILS = 50;

function severityOf(vuln: { database_specific?: { severity?: string }; severity?: { type: string; score: string }[] }): Vulnerability['severity'] {
  const label = String(vuln.database_specific?.severity ?? '').toLowerCase();
  if (label === 'critical' || label === 'high' || label === 'low') return label;
  if (label === 'moderate' || label === 'medium') return 'medium';
  // A CVSS vector without a label: use its base score if one is written out
  const score = Number(/\/?(\d+(\.\d+)?)$/.exec(vuln.severity?.[0]?.score ?? '')?.[1]);
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return score > 0 ? 'low' : 'medium';
}

// deno-lint-ignore no-explicit-any
function fixedVersion(vuln: any, pkg: Package): string | null {
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.name !== pkg.name) continue;
    for (const range of affected.ranges ?? []) {
      const fixed = (range.events ?? []).map((e: { fixed?: string }) => e.fixed).filter(Boolean);
      if (fixed.length) return fixed[fixed.length - 1];
    }
  }
  return null;
}

export async function findVulnerabilities(packages: Package[], fetchFn: typeof fetch = fetch): Promise<{ vulns: Vulnerability[]; checked: number; truncated: boolean }> {
  const hits: { pkg: Package; id: string }[] = [];
  for (let i = 0; i < packages.length; i += BATCH) {
    const chunk = packages.slice(i, i + BATCH);
    const res = await fetchFn('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: chunk.map((p) => ({ package: { ecosystem: p.ecosystem, name: p.name }, version: p.version })) }),
    });
    if (!res.ok) throw new Error(`OSV returned ${res.status}`);
    const body = await res.json();
    (body.results ?? []).forEach((result: { vulns?: { id: string }[] }, j: number) => {
      for (const v of result.vulns ?? []) hits.push({ pkg: chunk[j], id: v.id });
    });
  }

  const vulns: Vulnerability[] = [];
  for (const hit of hits.slice(0, MAX_DETAILS)) {
    const res = await fetchFn(`https://api.osv.dev/v1/vulns/${encodeURIComponent(hit.id)}`);
    if (!res.ok) {
      vulns.push({ pkg: hit.pkg, id: hit.id, summary: 'Known vulnerability (details unavailable)', severity: 'medium', fixed: null });
      continue;
    }
    const detail = await res.json();
    vulns.push({ pkg: hit.pkg, id: hit.id, summary: String(detail.summary ?? detail.details ?? 'Known vulnerability').slice(0, 200), severity: severityOf(detail), fixed: fixedVersion(detail, hit.pkg) });
  }
  return { vulns, checked: packages.length, truncated: hits.length > MAX_DETAILS };
}
