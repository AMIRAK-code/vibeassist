import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, Copy, FileUp, Lock, PackageSearch,
  ScanSearch, ShieldAlert, ShieldCheck, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from './ui/toast-context';
import { completeWithUserAi, useImportedAi } from '../lib/aiClient';
import {
  auditResponseHeaders, buildSecurityHeadersConfig, parseDependenciesText,
  RLS_HARDENING_CHECKS, scanDependenciesWithOsv, scanSecretsInText,
} from '../lib/securityScanner';
import { download } from '../lib/download';
import { fetchLiveUrlHeaders, isDesktopApp, scanLocalDirectory } from '../lib/desktopBridge';
import Notice from './ui/Notice';
import ModelSelectorPill from './ModelSelectorPill';

const SAMPLE_STRIPE = ['sk', 'live', '51AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'].join('_');
const SAMPLE_OPENAI = ['sk', 'proj', 'testAbCdEfGhIjKlMnOpQrStUvWxYz123456'].join('-');
const SAMPLE_ENV = [
  'VITE_SUPABASE_URL=https://example.supabase.co',
  'VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_safe123',
  '# Accidental leak example below:',
  `STRIPE_KEY=${SAMPLE_STRIPE}`,
  `OPENAI_API_KEY=${SAMPLE_OPENAI}`,
].join('\n');

const SAMPLE_PKG = `{
  "name": "indie-app",
  "dependencies": {
    "lodash": "4.17.15",
    "axios": "0.21.1",
    "react": "19.2.8"
  }
}`;

const SAMPLE_HEADERS = `HTTP/2 200
content-type: text/html; charset=utf-8
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin`;

export default function SecurityCenter() {
  const { hasPremium } = useAuth();
  const toast = useToast();
  const { active: securityAi } = useImportedAi('security');
  const [toolTab, setToolTab] = useState('secrets');

  // 1) Secret Scanner state
  const [secretText, setSecretText] = useState('');
  const [secretFilename, setSecretFilename] = useState('pasted-code.txt');
  const [secretResult, setSecretResult] = useState(null);
  const [nativeDirPath, setNativeDirPath] = useState('');
  const [nativeDirBusy, setNativeDirBusy] = useState(false);
  const [liveHeaderUrl, setLiveHeaderUrl] = useState('https://vibeassist.app');
  const [liveHeaderBusy, setLiveHeaderBusy] = useState(false);
  const desktopMode = isDesktopApp();

  // 2) Dependency CVE Scanner state
  const [pkgText, setPkgText] = useState('');
  const [osvBusy, setOsvBusy] = useState(false);
  const [osvError, setOsvError] = useState('');
  const [osvResult, setOsvResult] = useState(null);

  // 3) Headers & RLS state
  const [supabaseOrigin, setSupabaseOrigin] = useState('https://*.supabase.co');
  const [allowAiHosts, setAllowAiHosts] = useState(true);
  const [allowStripe, setAllowStripe] = useState(true);
  const [allowFrame, setAllowFrame] = useState(false);
  const [headerFormat, setHeaderFormat] = useState('cloudflare');
  const [pastedHeaders, setPastedHeaders] = useState('');

  // 4) AI Security Review state
  const [aiCode, setAiCode] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReview, setAiReview] = useState('');
  const [aiError, setAiError] = useState('');

  const runSecretScan = (text = secretText, name = secretFilename) => {
    setSecretResult(scanSecretsInText(text, name));
  };

  const handleSecretFiles = async (e) => {
    const files = [...(e.target.files ?? [])].slice(0, 12);
    e.target.value = '';
    if (!files.length) return;
    let combinedFindings = [];
    let totalLines = 0;
    for (const file of files) {
      if (file.size > 512 * 1024) continue;
      const content = await file.text();
      const res = scanSecretsInText(content, file.name);
      combinedFindings = [...combinedFindings, ...res.findings];
      totalLines += res.scannedLines;
    }
    setSecretResult({ findings: combinedFindings, scannedLines: totalLines });
    toast.show({ message: `Scanned ${files.length} file${files.length === 1 ? '' : 's'} locally in browser.` });
  };

  const handlePkgFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    setPkgText(text);
    setOsvResult(null);
    setOsvError('');
  };

  const runOsvScan = async (input = pkgText) => {
    setOsvError('');
    const parsed = parseDependenciesText(input);
    if (parsed.error) {
      setOsvError(parsed.error);
      return;
    }
    setOsvBusy(true);
    try {
      const result = await scanDependenciesWithOsv(parsed.packages);
      setOsvResult({ ...result, ecosystem: parsed.ecosystem });
    } catch (err) {
      setOsvError(err?.message || 'Could not reach OSV.dev vulnerability API.');
    } finally {
      setOsvBusy(false);
    }
  };

  const headersConfig = useMemo(
    () => buildSecurityHeadersConfig({ supabaseOrigin, allowAiHosts, allowStripe, allowFrame }),
    [supabaseOrigin, allowAiHosts, allowStripe, allowFrame],
  );
  const headerAudit = useMemo(
    () => (pastedHeaders.trim() ? auditResponseHeaders(pastedHeaders) : null),
    [pastedHeaders],
  );

  const runAiSecurityAudit = async () => {
    if (!securityAi || !aiCode.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError('');
    setAiReview('');
    try {
      const res = await completeWithUserAi({
        connection: securityAi,
        system: [
          'You are an AppSec and LLM security reviewer.',
          'Identify concrete security risks (auth/RLS gaps, XSS, SSRF, secret exposure, prompt injection, missing rate limits) in the provided code or architecture notes, with short actionable fixes.',
        ],
        messages: [{ role: 'user', content: aiCode.slice(0, 14000) }],
        maxTokens: 1200,
      });
      setAiReview(res.text);
    } catch (err) {
      setAiError(err?.message || 'AI review failed.');
    } finally {
      setAiBusy(false);
    }
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: `${label} copied.` });
    } catch {
      toast.show({ message: 'Copy blocked by browser.', tone: 'error' });
    }
  };

  return (
    <div className="stack-md">
      <div className="card">
        <div className="section-header">
          <div>
            <h2 className="card-title">Browser Security &amp; Vulnerability Lab</h2>
            <p className="card-subtitle">Scan code for leaked secrets, check dependencies against live OSV.dev CVEs, harden CSP/HSTS headers, and run AI threat reviews.</p>
          </div>
          {hasPremium ? (
            <Link to="/orchestrator" className="btn btn-secondary btn-sm">Open GitHub Red Team Engine</Link>
          ) : (
            <Link to="/ai-models" className="btn btn-secondary btn-sm">Configure AI Reviewer</Link>
          )}
        </div>

        <div className="segmented segmented--wrap" role="group" aria-label="Security tools" style={{ marginTop: 12 }}>
          <button type="button" aria-pressed={toolTab === 'secrets'} onClick={() => setToolTab('secrets')}>
            <ScanSearch aria-hidden="true" style={{ width: 15, height: 15 }} /> Secret Leak Scanner
          </button>
          <button type="button" aria-pressed={toolTab === 'deps'} onClick={() => setToolTab('deps')}>
            <PackageSearch aria-hidden="true" style={{ width: 15, height: 15 }} /> Dependency CVE Scanner
          </button>
          <button type="button" aria-pressed={toolTab === 'headers'} onClick={() => setToolTab('headers')}>
            <ShieldCheck aria-hidden="true" style={{ width: 15, height: 15 }} /> Security Headers &amp; RLS
          </button>
          <button type="button" aria-pressed={toolTab === 'ai_audit'} onClick={() => setToolTab('ai_audit')}>
            <Sparkles aria-hidden="true" style={{ width: 15, height: 15 }} /> AI Threat Review
          </button>
        </div>
      </div>

      {toolTab === 'secrets' && (
        <section className="card" aria-labelledby="sec-secrets-title">
          <div className="section-header">
            <div>
              <h3 id="sec-secrets-title" className="card-title">Client-Side Secret &amp; Credential Leak Scanner</h3>
              <p className="card-subtitle">Checks 14+ high-risk secret patterns (OpenAI, Anthropic, Gemini, Stripe live, GitHub PAT, Supabase secret, AWS, DB URIs, PEM keys). Nothing leaves your browser.</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setSecretText(SAMPLE_ENV); setSecretFilename('.env.example'); runSecretScan(SAMPLE_ENV, '.env.example'); }}
            >
              Load sample leak test
            </button>
          </div>

          <div className="page-actions" style={{ marginTop: 12 }}>
            <input id="secret-files-input" type="file" multiple className="visually-hidden" onChange={handleSecretFiles} />
            <label htmlFor="secret-files-input" className="btn btn-secondary btn-sm">
              <FileUp aria-hidden="true" /> Scan local files (up to 12)
            </label>
            <span className="field-help">Or paste code, <code>.env</code>, or a <code>git diff</code> below.</span>
          </div>

          {desktopMode && (
            <div className="inline-form" style={{ marginTop: 12 }}>
              <input
                type="text"
                className="input-field input-sm"
                style={{ flex: 1, minWidth: 240 }}
                value={nativeDirPath}
                onChange={(e) => setNativeDirPath(e.target.value)}
                placeholder="C:\path\to\project (Rust native recursive scan)"
                aria-label="Local folder path to scan in Rust"
                spellCheck="false"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={nativeDirBusy || !nativeDirPath.trim()}
                onClick={async () => {
                  setNativeDirBusy(true);
                  try {
                    const report = await scanLocalDirectory(nativeDirPath);
                    setSecretResult({
                      findings: report.findings,
                      scannedLines: report.scannedLines,
                      scannedFiles: report.scannedFiles,
                      elapsedMs: report.elapsedMs,
                    });
                    toast.show({ message: `Rust scanned ${report.scannedFiles} files (${report.scannedLines} lines) in ${report.elapsedMs}ms.` });
                  } catch (err) {
                    toast.show({ message: String(err?.message || err || 'Folder scan failed.'), tone: 'error' });
                  } finally {
                    setNativeDirBusy(false);
                  }
                }}
              >
                <ScanSearch aria-hidden="true" /> {nativeDirBusy ? 'Scanning…' : 'Scan folder (Rust)'}
              </button>
            </div>
          )}

          <div className="field" style={{ marginTop: 12 }}>
            <label className="visually-hidden" htmlFor="secret-scan-text">Code or env text to scan</label>
            <textarea
              id="secret-scan-text"
              className="input-field"
              rows={6}
              value={secretText}
              onChange={(e) => setSecretText(e.target.value)}
              placeholder="Paste .env, config files, or git diff output here…"
              spellCheck="false"
            />
          </div>

          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={() => runSecretScan()} disabled={!secretText.trim()}>
              <ScanSearch aria-hidden="true" /> Scan text for secrets
            </button>
            {secretText && (
              <button type="button" className="btn btn-ghost" onClick={() => { setSecretText(''); setSecretResult(null); }}>Clear</button>
            )}
          </div>

          {secretResult && (
            <div style={{ marginTop: 16 }}>
              {secretResult.findings.length === 0 ? (
                <Notice tone="success" title="No high-risk secrets detected">
                  Scanned {secretResult.scannedLines} lines locally in browser memory with 0 matches.
                </Notice>
              ) : (
                <div className="stack-xs">
                  <Notice tone="error" title={`${secretResult.findings.length} potential credential leak${secretResult.findings.length === 1 ? '' : 's'} detected`}>
                    Never commit live keys or expose them in <code>VITE_*</code> client variables.
                  </Notice>
                  <ul className="finding-list">
                    {secretResult.findings.map((f) => (
                      <li key={f.id} className="card finding">
                        <div className="finding-head">
                          <span className="badge badge--danger">{f.severity}</span>
                          <h4>{f.title}</h4>
                        </div>
                        <p className="finding-file"><code>{f.file}:{f.line}</code> · Matched: <code>{f.preview}</code></p>
                        <p className="finding-text"><strong>Fix:</strong> {f.remediation}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {toolTab === 'deps' && (
        <section className="card" aria-labelledby="sec-deps-title">
          <div className="section-header">
            <div>
              <h3 id="sec-deps-title" className="card-title">Live Dependency CVE Scanner (OSV.dev)</h3>
              <p className="card-subtitle">Paste <code>package.json</code>, <code>package-lock.json</code>, or <code>requirements.txt</code> to query the open-source OSV vulnerability database.</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setPkgText(SAMPLE_PKG); runOsvScan(SAMPLE_PKG); }}
            >
              Load sample package.json
            </button>
          </div>

          <div className="page-actions" style={{ marginTop: 12 }}>
            <input id="pkg-file-input" type="file" accept=".json,.txt" className="visually-hidden" onChange={handlePkgFile} />
            <label htmlFor="pkg-file-input" className="btn btn-secondary btn-sm">
              <FileUp aria-hidden="true" /> Upload manifest file
            </label>
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <label className="visually-hidden" htmlFor="pkg-scan-text">Package manifest JSON or requirements.txt</label>
            <textarea
              id="pkg-scan-text"
              className="input-field"
              rows={7}
              value={pkgText}
              onChange={(e) => setPkgText(e.target.value)}
              placeholder='{"dependencies": {"react": "19.2.8", ...}}'
              spellCheck="false"
            />
          </div>

          {osvError && <div style={{ marginBottom: 10 }}><Notice tone="error">{osvError}</Notice></div>}

          <button type="button" className="btn btn-primary" onClick={() => runOsvScan()} disabled={osvBusy || !pkgText.trim()} aria-busy={osvBusy}>
            <PackageSearch aria-hidden="true" /> {osvBusy ? 'Querying OSV.dev…' : 'Check for CVEs'}
          </button>

          {osvResult && (
            <div style={{ marginTop: 16 }}>
              {osvResult.vulnerable.length === 0 ? (
                <Notice tone="success" title="No known vulnerabilities found">
                  Checked {osvResult.checked} {osvResult.ecosystem} packages against OSV.dev.
                </Notice>
              ) : (
                <div className="stack-xs">
                  <Notice tone="warning" title={`${osvResult.vulnerable.length} vulnerable package${osvResult.vulnerable.length === 1 ? '' : 's'} out of ${osvResult.checked} checked`}>
                    Upgrade affected packages to their patched versions below.
                  </Notice>
                  <ul className="finding-list">
                    {osvResult.vulnerable.map((pkg) => (
                      <li key={`${pkg.name}@${pkg.version}`} className="card finding">
                        <div className="finding-head">
                          <span className="badge badge--danger">{pkg.vulns.length} advisory</span>
                          <h4><code>{pkg.name}@{pkg.version}</code></h4>
                        </div>
                        <ul className="stack-xs" style={{ marginTop: 8, listStyle: 'none' }}>
                          {pkg.vulns.map((v) => (
                            <li key={v.id} className="field-help">
                              <a href={v.url} target="_blank" rel="noreferrer"><strong>{v.id}</strong></a>
                              {' '}— {v.summary}{v.fixedIn ? <> · <strong>Fixed in {v.fixedIn}</strong></> : ''}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {toolTab === 'headers' && (
        <div className="stack-md">
          <section className="card" aria-labelledby="sec-headers-title">
            <div className="section-header">
              <div>
                <h3 id="sec-headers-title" className="card-title">CSP &amp; HTTP Security Headers Generator</h3>
                <p className="card-subtitle">Generate production-ready headers tailored to Supabase, Stripe, and browser-direct AI providers.</p>
              </div>
              <div className="segmented" role="group" aria-label="Export platform">
                <button type="button" aria-pressed={headerFormat === 'cloudflare'} onClick={() => setHeaderFormat('cloudflare')}>Cloudflare _headers</button>
                <button type="button" aria-pressed={headerFormat === 'vercel'} onClick={() => setHeaderFormat('vercel')}>vercel.json</button>
                <button type="button" aria-pressed={headerFormat === 'netlify'} onClick={() => setHeaderFormat('netlify')}>netlify.toml</button>
              </div>
            </div>

            <div className="grid-2" style={{ marginTop: 12 }}>
              <div className="field">
                <label className="field-label" htmlFor="csp-supabase">Supabase Origin</label>
                <input id="csp-supabase" className="input-field input-sm" value={supabaseOrigin} onChange={(e) => setSupabaseOrigin(e.target.value)} />
              </div>
              <div className="stack-xs" style={{ paddingTop: 6 }}>
                <label className="check-row"><input type="checkbox" checked={allowAiHosts} onChange={(e) => setAllowAiHosts(e.target.checked)} /> Allow BYOK AI hosts (Gemini, Anthropic, OpenAI, localhost)</label>
                <label className="check-row"><input type="checkbox" checked={allowStripe} onChange={(e) => setAllowStripe(e.target.checked)} /> Allow Stripe API</label>
                <label className="check-row"><input type="checkbox" checked={allowFrame} onChange={(e) => setAllowFrame(e.target.checked)} /> Allow SAMEORIGIN iframe embedding</label>
              </div>
            </div>

            <pre className="code-block" style={{ marginTop: 10 }}>{headersConfig[headerFormat]}</pre>
            <div className="page-actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => copyText(headersConfig[headerFormat], 'Security headers')}>
                <Copy aria-hidden="true" /> Copy config
              </button>
              {headerFormat === 'cloudflare' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => download('_headers', headersConfig.cloudflare, 'text/plain;charset=utf-8')}>
                  Download _headers
                </button>
              )}
            </div>
          </section>

          <div className="grid-2" style={{ alignItems: 'start' }}>
            <section className="card" aria-labelledby="header-audit-title">
              <div className="section-header">
                <h3 id="header-audit-title" className="card-title">Audit Live Headers (<code>curl -I</code>)</h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPastedHeaders(SAMPLE_HEADERS)}>Load example</button>
              </div>
              {desktopMode && (
                <div className="inline-form" style={{ marginTop: 8 }}>
                  <input
                    type="url"
                    className="input-field input-sm"
                    style={{ flex: 1 }}
                    value={liveHeaderUrl}
                    onChange={(e) => setLiveHeaderUrl(e.target.value)}
                    placeholder="https://yourapp.com"
                    aria-label="Live URL to inspect headers in Rust"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={liveHeaderBusy || !liveHeaderUrl.trim()}
                    onClick={async () => {
                      setLiveHeaderBusy(true);
                      try {
                        const res = await fetchLiveUrlHeaders(liveHeaderUrl);
                        setPastedHeaders(res.rawHeaders);
                        toast.show({ message: `Fetched HTTP ${res.status} headers via Rust.` });
                      } catch (err) {
                        toast.show({ message: String(err?.message || err || 'Could not fetch headers.'), tone: 'error' });
                      } finally {
                        setLiveHeaderBusy(false);
                      }
                    }}
                  >
                    {liveHeaderBusy ? 'Fetching…' : 'Fetch live (Rust)'}
                  </button>
                </div>
              )}
              <textarea
                className="input-field"
                rows={4}
                style={{ marginTop: 8 }}
                value={pastedHeaders}
                onChange={(e) => setPastedHeaders(e.target.value)}
                placeholder="Paste output of: curl -I https://yourapp.com"
                spellCheck="false"
              />
              {headerAudit && (
                <ul className="stack-xs" style={{ marginTop: 10, listStyle: 'none' }}>
                  {headerAudit.map((c) => (
                    <li key={c.key} className="field-help" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {c.ok
                        ? <CheckCircle2 aria-hidden="true" style={{ width: 15, height: 15, color: 'var(--app-success)' }} />
                        : <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, color: 'var(--app-warning)' }} />}
                      <span><strong>{c.label}</strong>{!c.ok ? ` — ${c.tip}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="rls-title">
              <h3 id="rls-title" className="card-title">Database &amp; RLS Hardening Checklist</h3>
              <ul className="stack-xs" style={{ marginTop: 10, listStyle: 'none' }}>
                {RLS_HARDENING_CHECKS.map((item) => (
                  <li key={item.id}>
                    <p style={{ fontWeight: 600, fontSize: 13.5 }}><Lock className="inline-icon" aria-hidden="true" /> {item.title}</p>
                    <p className="field-help">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}

      {toolTab === 'ai_audit' && (
        <section className="card" aria-labelledby="sec-ai-title">
          <h3 id="sec-ai-title" className="card-title">AI Security &amp; OWASP Reviewer</h3>
          <p className="card-subtitle" style={{ marginBottom: 12 }}>
            Paste an API handler, SQL migration, or Edge Function to check for auth/RLS bypasses, injection, or prompt-injection risks using your chosen AI (connect Ollama locally to keep private code off external APIs).
          </p>
          <ModelSelectorPill feature="security" hasPremium={hasPremium} allowCloud={false} />

          {!securityAi ? (
            <div style={{ marginTop: 12 }}>
              <Notice tone="info" title="No browser AI connected yet">
                <Link to="/ai-models">Import your Gemini, Claude, OpenAI, or local Ollama model</Link> to run browser-direct code security reviews.
              </Notice>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <textarea
                className="input-field"
                rows={7}
                value={aiCode}
                onChange={(e) => setAiCode(e.target.value)}
                placeholder="Paste route handler, Supabase SQL policy, or prompt logic…"
                spellCheck="false"
              />
              {aiError && <div style={{ marginTop: 10 }}><Notice tone="error">{aiError}</Notice></div>}
              <div className="page-actions" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-primary" onClick={runAiSecurityAudit} disabled={aiBusy || !aiCode.trim()} aria-busy={aiBusy}>
                  <ShieldAlert aria-hidden="true" /> {aiBusy ? 'Auditing…' : `Run Security Audit (${securityAi.label})`}
                </button>
              </div>
              {aiReview && (
                <pre className="code-block" style={{ whiteSpace: 'pre-wrap', marginTop: 14 }}>{aiReview}</pre>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
