import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AppWindow, Copy, Cpu, CreditCard, GitBranch, PlugZap, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { callFunction, friendlyError, supabase, supabasePublishableKey, supabaseUrl } from '../lib/supabase';
import { SYNCABLE, syncAllConnected } from '../lib/integrations';
import { isoDay } from '../lib/metrics';
import { formatDateTime } from '../lib/format';
import { useImportedAi } from '../lib/aiClient';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';
import ConfirmButton from '../components/ui/ConfirmButton';
import StoreCard from '../components/StoreCard';
import MetricsCsvImport from '../components/MetricsCsvImport';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'payments', label: 'Payments & CSV' },
  { id: 'stores', label: 'App Stores' },
  { id: 'api', label: 'Developer API' },
  { id: 'ai_code', label: 'AI & GitHub' },
];

const SNIPPET_LANGS = ['curl', 'js', 'python', 'swift', 'kotlin'];

function buildApiSnippet(lang, key = 'YOUR_API_KEY') {
  const endpoint = `${supabaseUrl}/rest/v1/rpc/ingest_metrics`;
  const today = isoDay(new Date());
  const payload = `{"p_api_key": "${key}", "p_rows": [{"date": "${today}", "revenue": 120.50, "organic_downloads": 40, "paid_downloads": 12, "purchases": 5, "active_users": 800}]}`;

  if (lang === 'js') {
    return `await fetch('${endpoint}', {\n  method: 'POST',\n  headers: {\n    apikey: '${supabasePublishableKey}',\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify(${payload}),\n});`;
  }
  if (lang === 'python') {
    return `import requests\n\nrequests.post(\n    "${endpoint}",\n    headers={"apikey": "${supabasePublishableKey}", "Content-Type": "application/json"},\n    json=${payload},\n    timeout=10,\n)`;
  }
  if (lang === 'swift') {
    return `var req = URLRequest(url: URL(string: "${endpoint}")!)\nreq.httpMethod = "POST"\nreq.setValue("${supabasePublishableKey}", forHTTPHeaderField: "apikey")\nreq.setValue("application/json", forHTTPHeaderField: "Content-Type")\nreq.httpBody = #"${payload}"#.data(using: .utf8)\nURLSession.shared.dataTask(with: req).resume()`;
  }
  if (lang === 'kotlin') {
    return `val body = """${payload}""".toRequestBody("application/json".toMediaType())\nval req = Request.Builder()\n  .url("${endpoint}")\n  .addHeader("apikey", "${supabasePublishableKey}")\n  .post(body).build()`;
  }
  return `curl -X POST "${endpoint}" \\\n  -H "apikey: ${supabasePublishableKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '${payload}'`;
}

export default function Integrations() {
  const { hasPremium } = useAuth();
  const toast = useToast();
  const { models: aiModels, active: activeAi } = useImportedAi('default');

  const [category, setCategory] = useState('all');
  const [integrations, setIntegrations] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [testPingKey, setTestPingKey] = useState('');
  const [pingResult, setPingResult] = useState(null);
  const [lang, setLang] = useState('curl');
  const [stripeKey, setStripeKey] = useState('');
  const [busy, setBusy] = useState('');
  const [stripeError, setStripeError] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    const [connections, keys] = await Promise.all([
      supabase.from('integrations').select('provider, status, account_label, last_error, last_synced_at, settings'),
      supabase.from('api_keys').select('key_prefix, created_at, last_used_at').eq('scope', 'metrics').is('revoked_at', null).maybeSingle(),
    ]);
    if (connections.error) setLoadError(friendlyError(connections.error, 'Could not load your connections.'));
    else setLoadError('');
    setIntegrations(Object.fromEntries((connections.data ?? []).map((row) => [row.provider, row])));
    setActiveKey(keys.data ?? null);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const stripe = integrations?.stripe;
  const github = integrations?.github;
  const stripeConnected = stripe?.status === 'connected';
  const syncableConnections = useMemo(
    () => Object.values(integrations ?? {}).filter((c) => c.status === 'connected' && SYNCABLE[c.provider]),
    [integrations],
  );
  const connectedCount = useMemo(
    () => Object.values(integrations ?? {}).filter((c) => c.status === 'connected').length + (activeKey ? 1 : 0) + aiModels.length,
    [integrations, activeKey, aiModels.length],
  );

  const stripeSecurityWarning = useMemo(() => {
    const k = stripeKey.trim();
    if (!k) return '';
    if (k.startsWith('sk_live_') || k.startsWith('sk_test_')) {
      return 'Security block: Never paste a full Stripe Secret Key (sk_…). Create a read-only Restricted Key (rk_live_…) with Balance read access only.';
    }
    if (k.startsWith('pk_')) {
      return 'Publishable keys (pk_…) cannot read balance transactions. Create a Restricted Key (rk_live_…).';
    }
    return '';
  }, [stripeKey]);

  const syncAll = async () => {
    if (!syncableConnections.length || busy) return;
    setBusy('sync-all');
    const outcomes = await syncAllConnected(syncableConnections, callFunction);
    setBusy('');
    await load();
    const anyFail = outcomes.some((o) => !o.ok);
    toast.show({ message: outcomes.map((o) => o.text).join(' · '), tone: anyFail ? 'error' : undefined });
  };

  const stripeAction = async (action, extra = {}) => {
    if (busy) return;
    if (action === 'connect') {
      if (!hasPremium) {
        setStripeError('Automated Stripe sync requires Premium. You can export your Stripe Balance CSV and import it below for free.');
        return;
      }
      if (stripeSecurityWarning) {
        setStripeError(stripeSecurityWarning);
        return;
      }
    }
    setBusy(`stripe-${action}`);
    setStripeError('');
    const { data, status } = await callFunction('stripe-sync', { action, ...extra });
    setBusy('');
    if (status !== 200) {
      setStripeError(data?.error ?? 'Stripe request failed. Try again.');
    } else if (action === 'disconnect') {
      toast.show({ message: 'Stripe disconnected. Revenue already imported stays on Overall Income.' });
    } else {
      setStripeKey('');
      const skipped = data.otherCurrency ? ` ${data.otherCurrency} in other currencies were skipped.` : '';
      const capped = data.truncated ? ' Only the latest 3,000 transactions were imported.' : '';
      toast.show({ message: `Imported ${data.transactions} transactions across ${data.days} days (${data.currency}).${skipped}${capped}` });
    }
    await load();
  };

  const generateKey = async () => {
    if (busy) return;
    setBusy('key');
    const { data, error } = await supabase.rpc('create_api_key');
    setBusy('');
    if (error) toast.show({ message: friendlyError(error, 'Could not create a key. Try again.'), tone: 'error' });
    else {
      setNewKey(data);
      setTestPingKey(data);
    }
    await load();
  };

  const revokeKey = async () => {
    setBusy('revoke');
    const { error } = await supabase.rpc('revoke_api_key');
    setBusy('');
    setNewKey('');
    setTestPingKey('');
    if (error) toast.show({ message: friendlyError(error, 'Could not revoke the key. Try again.'), tone: 'error' });
    else toast.show({ message: 'Key revoked. Apps using it can no longer send numbers.' });
    await load();
  };

  const sendTestPing = async () => {
    const keyToUse = (testPingKey || newKey).trim();
    if (!keyToUse) {
      toast.show({ message: 'Create a key or paste your va_… key to run a live ingestion test.', tone: 'error' });
      return;
    }
    setBusy('ping');
    setPingResult(null);
    const today = isoDay(new Date());
    const { data, error } = await supabase.rpc('ingest_metrics', {
      p_api_key: keyToUse,
      p_rows: [{ date: today, revenue: 0, organic_downloads: 0, paid_downloads: 0, purchases: 0 }],
    });
    setBusy('');
    if (error) {
      setPingResult({ ok: false, text: friendlyError(error, 'Ingestion failed.') });
    } else {
      setPingResult({ ok: true, text: `HTTP 200 · ingested ${data ?? 1} row for ${today}. Endpoint verified.` });
      await load();
    }
  };

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: `${what} copied.` });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser.', tone: 'error' });
    }
  };

  const show = (cat) => category === 'all' || category === cat;

  return (
    <>
      <PageHeader
        title="Connections & Data Hub"
        description="Connect revenue stores, CSV exports, developer ingestion APIs, AI model keys, and GitHub guardrails in one place."
      >
        {syncableConnections.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={syncAll} disabled={Boolean(busy)} aria-busy={busy === 'sync-all'}>
            <RefreshCw aria-hidden="true" /> {busy === 'sync-all' ? 'Syncing all…' : `Sync all (${syncableConnections.length})`}
          </button>
        )}
        <Link to="/ai-models" className="btn btn-secondary">
          <Cpu aria-hidden="true" /> Import Your AI
        </Link>
      </PageHeader>

      {loadError && <div className="section"><Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice></div>}

      <div className="stat-grid section" style={{ marginTop: 0 }}>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">Active Connections</span>
            <PlugZap className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value">{connectedCount}</p>
          <p className="stat-change">{syncableConnections.length} automated store sync · {aiModels.length} AI models</p>
        </div>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">AI Model Vault</span>
            <Cpu className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value" style={{ fontSize: 18 }}>{activeAi ? activeAi.label : 'Cloud / None'}</p>
          <p className="stat-change">
            <Link to="/ai-models">{aiModels.length ? `${aiModels.length} connected · configure routing` : 'Import Gemini, Claude, OpenAI, or Ollama'}</Link>
          </p>
        </div>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">GitHub Guardrails</span>
            <GitBranch className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value" style={{ fontSize: 18 }}>{github?.status === 'connected' ? github.account_label : 'Not connected'}</p>
          <p className="stat-change">
            <Link to="/orchestrator">{hasPremium ? 'Manage read-only GitHub PAT' : 'Or scan locally in Security Lab'}</Link>
          </p>
        </div>
      </div>

      <div className="segmented segmented--wrap section" role="group" aria-label="Filter connections">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="source-list section">
        {show('payments') && <MetricsCsvImport onImported={load} />}

        {show('payments') && (
          <section className="card" aria-labelledby="stripe-title">
            <div className="source-head">
              <CreditCard aria-hidden="true" />
              <div>
                <h2 id="stripe-title" className="card-title">Stripe (Web Payments)</h2>
                <p className="card-subtitle">Daily revenue, refunds, fees and purchases for the last 90 days.</p>
              </div>
              {integrations && (
                <span className={`badge ${stripeConnected ? 'badge--success' : stripe?.status === 'error' ? 'badge--danger' : ''}`}>
                  {stripeConnected ? `Connected · ${stripe.account_label}` : stripe?.status === 'error' ? 'Needs attention' : 'Not connected'}
                </span>
              )}
            </div>

            {stripeConnected ? (
              <>
                <p className="field-help" style={{ marginTop: 12 }}>Last synced {stripe.last_synced_at ? formatDateTime(stripe.last_synced_at) : 'never'}.</p>
                <div className="page-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-primary" onClick={() => stripeAction('sync')} disabled={Boolean(busy)} aria-busy={busy === 'stripe-sync'}>
                    {busy === 'stripe-sync' ? <><span className="spinner spinner--light" /> Syncing…</> : <><RefreshCw aria-hidden="true" /> Sync now</>}
                  </button>
                  <ConfirmButton
                    label="Disconnect"
                    question="Disconnect Stripe? You'll need to paste the key again to reconnect."
                    busyLabel="Disconnecting…"
                    busy={busy === 'stripe-disconnect'}
                    disabled={Boolean(busy)}
                    onConfirm={() => stripeAction('disconnect')}
                  />
                </div>
              </>
            ) : (
              <form style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); stripeAction('connect', { key: stripeKey }); }}>
                {!hasPremium && (
                  <div style={{ marginBottom: 12 }}>
                    <Notice tone="info" actions={<Link className="btn btn-secondary btn-sm" to="/premium?from=/integrations">See Premium</Link>}>
                      Automated 90-day Stripe sync is part of Premium. Export a Stripe Balance CSV and drop it in the free CSV Importer above anytime.
                    </Notice>
                  </div>
                )}
                {stripe?.status === 'error' && <div style={{ marginBottom: 12 }}><Notice tone="error">{stripe.last_error} Paste a working key to reconnect.</Notice></div>}
                <div className="field">
                  <label className="field-label" htmlFor="stripe-key">Restricted key (read-only)</label>
                  <input
                    id="stripe-key"
                    type="password"
                    className="input-field"
                    placeholder="rk_live_…"
                    autoComplete="off"
                    spellCheck="false"
                    value={stripeKey}
                    onChange={(e) => { setStripeKey(e.target.value); setStripeError(''); }}
                    aria-invalid={Boolean(stripeError || stripeSecurityWarning)}
                    aria-describedby="stripe-key-help"
                  />
                  <span id="stripe-key-help" className="field-help">
                    In Stripe, open Developers → API keys → Create restricted key with <strong>Balance (Read)</strong> only. Stored encrypted in Vault.
                  </span>
                </div>
                {stripeSecurityWarning && <div style={{ marginBottom: 12 }}><Notice tone="error">{stripeSecurityWarning}</Notice></div>}
                {stripeError && !stripeSecurityWarning && <div style={{ marginBottom: 12 }}><Notice tone="error">{stripeError}</Notice></div>}
                <button type="submit" className="btn btn-primary" disabled={Boolean(busy) || !stripeKey.trim() || Boolean(stripeSecurityWarning) || !hasPremium} aria-busy={busy === 'stripe-connect'}>
                  {busy === 'stripe-connect' ? <><span className="spinner spinner--light" /> Connecting and importing…</> : 'Connect Stripe'}
                </button>
              </form>
            )}
            {stripeConnected && stripeError && <div style={{ marginTop: 12 }}><Notice tone="error">{stripeError}</Notice></div>}
          </section>
        )}

        {show('api') && (
          <section className="card" aria-labelledby="api-title">
            <div className="source-head">
              <AppWindow aria-hidden="true" />
              <div>
                <h2 id="api-title" className="card-title">Custom API (Web / Server / App SDK)</h2>
                <p className="card-subtitle">Push daily revenue, downloads, and active users from your own app or cron job with one POST request.</p>
              </div>
              {integrations && <span className={`badge ${activeKey ? 'badge--success' : ''}`}>{activeKey ? `Key ${activeKey.key_prefix}…` : 'No key'}</span>}
            </div>

            {newKey && (
              <div style={{ marginTop: 14 }}>
                <Notice tone="warning" title="Copy your key now. It won't be shown again.">
                  <div className="key-row">
                    <code>{newKey}</code>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(newKey, 'API key')}><Copy aria-hidden="true" /> Copy</button>
                  </div>
                </Notice>
              </div>
            )}

            {activeKey && (
              <>
                <p className="field-help" style={{ marginTop: 12 }}>
                  Created {formatDateTime(activeKey.created_at)} · {activeKey.last_used_at ? `last used ${formatDateTime(activeKey.last_used_at)}` : 'not used yet'}
                </p>

                <div style={{ marginTop: 12 }}>
                  <div className="segmented" role="group" aria-label="Snippet language" style={{ marginBottom: 8 }}>
                    {SNIPPET_LANGS.map((l) => (
                      <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
                        {l === 'js' ? 'JS / TS' : l === 'curl' ? 'cURL' : l[0].toUpperCase() + l.slice(1)}
                      </button>
                    ))}
                  </div>
                  <pre className="code-block">{buildApiSnippet(lang, newKey || 'YOUR_API_KEY')}</pre>
                  <div className="page-actions" style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(buildApiSnippet(lang, newKey || 'YOUR_API_KEY'), 'Code snippet')}>
                      <Copy aria-hidden="true" /> Copy snippet
                    </button>
                  </div>
                </div>

                <div className="inline-form" style={{ marginTop: 12 }}>
                  <label className="visually-hidden" htmlFor="ping-key-input">API key for test ping</label>
                  <input
                    id="ping-key-input"
                    type="password"
                    className="input-field input-sm"
                    style={{ flex: 1 }}
                    placeholder="Paste va_… key to send live test ping"
                    value={testPingKey}
                    onChange={(e) => setTestPingKey(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={sendTestPing} disabled={busy === 'ping'}>
                    <PlugZap aria-hidden="true" /> {busy === 'ping' ? 'Pinging…' : 'Send Test Event'}
                  </button>
                </div>
                {pingResult && (
                  <div style={{ marginTop: 8 }}>
                    <Notice tone={pingResult.ok ? 'success' : 'error'}>{pingResult.text}</Notice>
                  </div>
                )}
              </>
            )}

            <div className="page-actions" style={{ marginTop: 14 }}>
              {activeKey ? (
                <>
                  <ConfirmButton label="Replace key" question="Replace the key? Apps using the current key will stop working." busyLabel="Creating…" busy={busy === 'key'} disabled={Boolean(busy)} onConfirm={generateKey} />
                  <ConfirmButton label="Revoke key" question="Revoke the key? Apps using it will stop sending numbers." busyLabel="Revoking…" busy={busy === 'revoke'} disabled={Boolean(busy)} onConfirm={revokeKey} />
                </>
              ) : (
                <button type="button" className="btn btn-primary" onClick={generateKey} disabled={Boolean(busy)} aria-busy={busy === 'key'}>
                  {busy === 'key' ? 'Creating…' : 'Create API key'}
                </button>
              )}
            </div>
          </section>
        )}

        {show('stores') && (
          <>
            <StoreCard provider="google_play" hasPremium={hasPremium} integration={integrations ? integrations.google_play ?? null : undefined} onChanged={load} />
            <StoreCard provider="app_store" hasPremium={hasPremium} integration={integrations ? integrations.app_store ?? null : undefined} onChanged={load} />
          </>
        )}

        {show('ai_code') && (
          <div className="grid-2">
            <section className="card" aria-labelledby="conn-ai-title">
              <div className="source-head">
                <Cpu aria-hidden="true" />
                <div>
                  <h2 id="conn-ai-title" className="card-title">AI Model Keys &amp; Local Endpoints</h2>
                  <p className="card-subtitle">Gemini, Claude, OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Ollama, and LM Studio.</p>
                </div>
                <span className="badge badge--cobalt">{aiModels.length} connected</span>
              </div>
              <div className="page-actions" style={{ marginTop: 14 }}>
                <Link to="/ai-models" className="btn btn-primary">Manage AI Connections</Link>
              </div>
            </section>

            <section className="card" aria-labelledby="conn-gh-title">
              <div className="source-head">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <h2 id="conn-gh-title" className="card-title">GitHub &amp; Security Lab</h2>
                  <p className="card-subtitle">Read-only fine-grained PAT integration for Red Team &amp; Drift Watch, plus free browser secret/CVE scanning.</p>
                </div>
                <span className={`badge${github?.status === 'connected' ? ' badge--success' : ''}`}>{github?.status === 'connected' ? github.account_label : 'Optional'}</span>
              </div>
              <div className="page-actions" style={{ marginTop: 14 }}>
                <Link to="/orchestrator" className="btn btn-secondary">GitHub Orchestrator</Link>
                <Link to="/publishing?tab=security" className="btn btn-ghost">Browser Security Lab</Link>
              </div>
            </section>
          </div>
        )}

        <p className="field-help">
          Store downloads count as organic installs. If you also imported or typed those same days under manual entries, delete duplicates on Overall Income so nothing is counted twice.
        </p>
      </div>
    </>
  );
}
