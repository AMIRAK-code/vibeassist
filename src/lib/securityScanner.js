// Client-side Security & Vulnerability Scanner:
// 1) High-signal secret & credential leak patterns (runs strictly in browser memory)
// 2) package.json / package-lock.json / requirements.txt parser + OSV.dev live CVE lookup
// 3) HTTP Security Headers (Cloudflare / Vercel / Netlify) generator & curl -I header auditor

export const SECRET_PATTERNS = [
  {
    id: 'openai_key',
    title: 'OpenAI API Key',
    severity: 'critical',
    regex: /\bsk-(?:proj|svcacct|live|test)?-[A-Za-z0-9_-]{20,}\b/g,
    remediation: 'Revoke immediately in OpenAI Platform and move to server env vars or browser BYOK vault.',
  },
  {
    id: 'anthropic_key',
    title: 'Anthropic API Key',
    severity: 'critical',
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    remediation: 'Rotate in Anthropic Console immediately. Never bundle in Vite VITE_* env vars.',
  },
  {
    id: 'google_api_key',
    title: 'Google / Gemini API Key',
    severity: 'high',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    remediation: 'Restrict HTTP referrers/APIs in Google Cloud or revoke in Google AI Studio.',
  },
  {
    id: 'stripe_secret',
    title: 'Stripe Live Secret / Restricted Key',
    severity: 'critical',
    regex: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/g,
    remediation: 'Roll the key in Stripe Dashboard → Developers → API keys. Only pk_live_ is safe in client code.',
  },
  {
    id: 'stripe_webhook',
    title: 'Stripe Webhook Signing Secret',
    severity: 'high',
    regex: /\bwhsec_[0-9A-Za-z]{20,}\b/g,
    remediation: 'Move to Edge Function Secrets; rotate webhook secret if committed.',
  },
  {
    id: 'github_pat',
    title: 'GitHub Personal Access Token',
    severity: 'critical',
    regex: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
    remediation: 'Revoke on GitHub → Developer settings → Personal access tokens.',
  },
  {
    id: 'supabase_secret',
    title: 'Supabase Secret / Access Token',
    severity: 'critical',
    regex: /\b(?:sb_secret_[A-Za-z0-9_-]{16,}|sbp_[A-Za-z0-9]{20,})\b/g,
    remediation: 'Rotate Supabase secret keys immediately. Only sb_publishable_ belongs in client bundles.',
  },
  {
    id: 'aws_access_key',
    title: 'AWS Access Key ID',
    severity: 'critical',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    remediation: 'Deactivate the IAM access key in AWS Console and audit CloudTrail.',
  },
  {
    id: 'slack_token',
    title: 'Slack Bot / User Token',
    severity: 'high',
    regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
    remediation: 'Regenerate token in Slack App settings.',
  },
  {
    id: 'private_key_block',
    title: 'PEM Private Key (.p8 / RSA / EC)',
    severity: 'critical',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
    remediation: 'Remove private keys from source control and rotate the certificate/signing key.',
  },
  {
    id: 'db_connection_uri',
    title: 'Database URI with Embedded Password',
    severity: 'critical',
    regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/]+:[^@\s]{6,}@[^\s/]+/gi,
    remediation: 'Rotate the database user password and move the connection string to server secrets.',
  },
  {
    id: 'hardcoded_bearer',
    title: 'Hardcoded Bearer / Authorization Token',
    severity: 'high',
    regex: /Authorization['"]?\s*[:=]\s*['"]Bearer\s+[A-Za-z0-9._-]{24,}['"]/gi,
    remediation: 'Read tokens dynamically from environment or secure session storage at runtime.',
  },
  {
    id: 'groq_key',
    title: 'Groq API Key',
    severity: 'high',
    regex: /\bgsk_[A-Za-z0-9]{24,}\b/g,
    remediation: 'Revoke in Groq Console and remove from repository history.',
  },
  {
    id: 'resend_key',
    title: 'Resend Email API Key',
    severity: 'high',
    regex: /\bre_[A-Za-z0-9_]{20,}\b/g,
    remediation: 'Rotate in Resend dashboard; keep server-side only.',
  },
];

function maskMatch(text) {
  if (!text) return '';
  if (text.length <= 12) return `${text.slice(0, 4)}…`;
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

export function scanSecretsInText(content, filename = 'snippet.txt') {
  const lines = String(content ?? '').replace(/\r\n/g, '\n').split('\n');
  const findings = [];
  const seen = new Set();

  lines.forEach((lineText, idx) => {
    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(lineText)) !== null) {
        const raw = match[0];
        if (/example|placeholder|your[_-]?key|xxxx/i.test(raw)) continue;
        const dedupKey = `${pattern.id}:${idx + 1}:${raw.slice(0, 8)}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        findings.push({
          id: `${pattern.id}-${idx + 1}-${findings.length}`,
          ruleId: pattern.id,
          title: pattern.title,
          severity: pattern.severity,
          file: filename,
          line: idx + 1,
          preview: maskMatch(raw),
          remediation: pattern.remediation,
        });
      }
    }
  });

  return { findings, scannedLines: lines.length };
}

function cleanSemver(raw) {
  const cleaned = String(raw ?? '').trim().replace(/^[~^>=<\s]+/, '').split(/\s+/)[0];
  return /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(cleaned) ? cleaned : '';
}

export function parseDependenciesText(rawText) {
  const text = String(rawText ?? '').trim();
  if (!text) return { ecosystem: null, packages: [], error: 'Paste package.json, package-lock.json, or requirements.txt first.' };

  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      const packages = [];
      const seen = new Set();
      const pushPkg = (name, version) => {
        const ver = cleanSemver(version);
        if (!name || !ver || seen.has(`${name}@${ver}`)) return;
        seen.add(`${name}@${ver}`);
        packages.push({ name, version: ver, ecosystem: 'npm' });
      };

      if (json.packages && typeof json.packages === 'object') {
        for (const [pkgPath, meta] of Object.entries(json.packages)) {
          if (!pkgPath || !meta?.version) continue;
          const name = pkgPath.replace(/^.*node_modules\//, '');
          pushPkg(name, meta.version);
        }
      }
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        if (json[field] && typeof json[field] === 'object') {
          for (const [name, ver] of Object.entries(json[field])) {
            pushPkg(name, typeof ver === 'string' ? ver : ver?.version);
          }
        }
      }

      if (!packages.length) {
        return { ecosystem: 'npm', packages: [], error: 'No pinned versions (e.g. 1.2.3 or ^1.2.3) found in JSON.' };
      }
      return { ecosystem: 'npm', packages: packages.slice(0, 150), error: '' };
    } catch {
      return { ecosystem: null, packages: [], error: 'Invalid JSON syntax. Check your package.json.' };
    }
  }

  // requirements.txt style: pkg==1.2.3
  const packages = [];
  for (const line of text.split(/\r?\n/)) {
    const clean = line.split('#')[0].trim();
    const m = /^([A-Za-z0-9._-]+)==([0-9][A-Za-z0-9._-]*)/.exec(clean);
    if (m) packages.push({ name: m[1], version: m[2], ecosystem: 'PyPI' });
  }
  if (!packages.length) {
    return { ecosystem: null, packages: [], error: 'Could not detect npm JSON or pinned Python (pkg==1.2.3) dependencies.' };
  }
  return { ecosystem: 'PyPI', packages: packages.slice(0, 150), error: '' };
}

export async function scanDependenciesWithOsv(packages) {
  if (!packages.length) return { checked: 0, vulnerable: [] };
  const queries = packages.map((pkg) => ({
    package: { name: pkg.name, ecosystem: pkg.ecosystem },
    version: pkg.version,
  }));

  const res = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries }),
  });
  if (!res.ok) throw new Error(`OSV.dev returned HTTP ${res.status}`);
  const batch = await res.json();
  const vulnerable = [];

  (batch.results ?? []).forEach((result, i) => {
    const vulns = result?.vulns ?? [];
    if (!vulns.length) return;
    vulnerable.push({
      name: packages[i].name,
      version: packages[i].version,
      ecosystem: packages[i].ecosystem,
      vulns: vulns.map((v) => ({
        id: v.id,
        modified: v.modified,
        url: `https://osv.dev/vulnerability/${encodeURIComponent(v.id)}`,
      })),
    });
  });

  // Fetch summaries for up to 12 unique vulnerability IDs so users get actionable descriptions
  const uniqueIds = [...new Set(vulnerable.flatMap((p) => p.vulns.map((v) => v.id)))].slice(0, 12);
  if (uniqueIds.length) {
    const details = await Promise.allSettled(
      uniqueIds.map((id) => fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null))),
    );
    const byId = new Map();
    details.forEach((d, idx) => {
      if (d.status === 'fulfilled' && d.value) byId.set(uniqueIds[idx], d.value);
    });
    for (const pkg of vulnerable) {
      pkg.vulns = pkg.vulns.map((v) => {
        const info = byId.get(v.id);
        const fixed = info?.affected?.flatMap((a) => a.ranges ?? [])
          .flatMap((r) => r.events ?? [])
          .find((e) => e.fixed)?.fixed;
        return {
          ...v,
          summary: info?.summary || info?.details?.slice(0, 140) || 'Known vulnerability reported in OSV.',
          severity: info?.database_specific?.severity || 'HIGH',
          fixedIn: fixed || null,
        };
      });
    }
  }

  return { checked: packages.length, vulnerable };
}

export function buildSecurityHeadersConfig({
  supabaseOrigin = 'https://*.supabase.co',
  allowAiHosts = true,
  allowStripe = true,
  allowFrame = false,
} = {}) {
  const connectSources = ["'self'", supabaseOrigin];
  if (allowStripe) connectSources.push('https://api.stripe.com');
  if (allowAiHosts) {
    connectSources.push(
      'https://generativelanguage.googleapis.com',
      'https://api.anthropic.com',
      'https://api.openai.com',
      'https://openrouter.ai',
      'https://api.groq.com',
      'https://api.deepseek.com',
      'https://api.mistral.ai',
      'http://localhost:11434',
      'http://localhost:1234',
    );
  }

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    `frame-ancestors ${allowFrame ? "'self'" : "'none'"}`,
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const headers = [
    { name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
    { name: 'X-Content-Type-Options', value: 'nosniff' },
    { name: 'X-Frame-Options', value: allowFrame ? 'SAMEORIGIN' : 'DENY' },
    { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { name: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { name: 'Content-Security-Policy', value: csp },
  ];

  const cloudflare = `/*\n${headers.map((h) => `  ${h.name}: ${h.value}`).join('\n')}\n`;
  const vercel = JSON.stringify({
    headers: [{ source: '/(.*)', headers: headers.map((h) => ({ key: h.name, value: h.value })) }],
  }, null, 2);
  const netlify = `[[headers]]\n  for = "/*"\n  [headers.values]\n${headers.map((h) => `    ${h.name} = "${h.value.replace(/"/g, '\\"')}"`).join('\n')}\n`;

  return { headers, cloudflare, vercel, netlify };
}

export function auditResponseHeaders(rawHeaders) {
  const lines = String(rawHeaders ?? '').split(/\r?\n/).filter((l) => l.includes(':'));
  const map = new Map();
  for (const line of lines) {
    const idx = line.indexOf(':');
    map.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
  }

  const checks = [
    { key: 'strict-transport-security', label: 'HSTS (Strict-Transport-Security)', ok: map.has('strict-transport-security'), tip: 'Enforce HTTPS with max-age=31536000.' },
    { key: 'content-security-policy', label: 'Content-Security-Policy (CSP)', ok: map.has('content-security-policy'), tip: 'Restrict script-src and connect-src to mitigate XSS.' },
    { key: 'x-content-type-options', label: 'X-Content-Type-Options: nosniff', ok: /nosniff/i.test(map.get('x-content-type-options') ?? ''), tip: 'Set to nosniff to prevent MIME sniffing.' },
    { key: 'x-frame-options', label: 'Clickjacking protection (X-Frame-Options / frame-ancestors)', ok: map.has('x-frame-options') || /frame-ancestors/i.test(map.get('content-security-policy') ?? ''), tip: 'Add X-Frame-Options: DENY or CSP frame-ancestors.' },
    { key: 'referrer-policy', label: 'Referrer-Policy', ok: map.has('referrer-policy'), tip: 'Use strict-origin-when-cross-origin to avoid leaking URL paths.' },
  ];

  if (map.get('access-control-allow-origin') === '*' && map.has('access-control-allow-credentials')) {
    checks.push({ key: 'cors', label: 'Safe CORS configuration', ok: false, tip: 'Never combine wildcard Access-Control-Allow-Origin with credentials.' });
  }
  return checks;
}

export const RLS_HARDENING_CHECKS = [
  { id: 'rls-enabled', title: 'Row-Level Security enabled on every public table', detail: 'Run: select tablename, rowsecurity from pg_tables where schemaname = \'public\';' },
  { id: 'rls-select-auth', title: 'Policies scope rows with (select auth.uid()) = user_id', detail: 'Wrapping auth.uid() in a subselect improves Postgres query plan caching and prevents cross-tenant leakage.' },
  { id: 'rls-column-grants', title: 'Column-level UPDATE grants lock immutable fields', detail: 'Ensure clients cannot overwrite billing status, user_id, or server-calculated metrics.' },
  { id: 'rls-vault-secrets', title: 'Provider & Stripe keys live exclusively in Vault or browser memory', detail: 'Never expose service_role or secret API keys in VITE_* build variables.' },
];
