import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, Cloud, Copy, Cpu, Eye, EyeOff, HardDrive, KeyRound,
  Lock, Play, PlugZap, RefreshCw, ShieldCheck, Sparkles, Trash2, Zap,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import {
  AI_FEATURE_SLOTS, AI_PROVIDERS, PROVIDER_LIST, clearBrowserAiVault,
  completeWithUserAi, discoverProviderModels, removeImportedModel, saveAiRouting,
  testAiConnection, upsertImportedModel, useImportedAi, validateProviderKey,
} from '../lib/aiClient';
import { engine } from '../lib/engine';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';
import ConfirmButton from '../components/ui/ConfirmButton';
import Elapsed from '../components/ui/Elapsed';

const CATEGORIES = [
  { id: 'top', label: 'Top Cloud Models', hint: 'Gemini, Claude & OpenAI' },
  { id: 'frontier', label: 'Routers & Frontier', hint: 'OpenRouter, Groq, DeepSeek, Mistral' },
  { id: 'local', label: 'Local & Self-Hosted', hint: 'Ollama, LM Studio, vLLM' },
];

const SAMPLE_PROMPTS = [
  'Give me 3 concrete ways an indie SaaS app can improve trial-to-paid conversion without discounts.',
  'List the top 5 security checks every solo developer should run before launching a React + Supabase app.',
  'Draft a 2-sentence App Store privacy summary for an app that stores metrics locally and uses Stripe.',
];

function emptyDraft(providerId = 'gemini') {
  const p = AI_PROVIDERS[providerId] ?? AI_PROVIDERS.gemini;
  return {
    id: null,
    provider: p.id,
    label: p.label,
    apiKey: '',
    baseUrl: p.baseUrl,
    format: p.format,
    defaultModel: p.defaultModel,
    storageMode: 'local',
    syncToGateway: false,
  };
}

export default function ImportAI() {
  const { hasPremium } = useAuth();
  const toast = useToast();
  const { models, routing, active } = useImportedAi('default');

  const [category, setCategory] = useState('top');
  const [form, setForm] = useState(() => emptyDraft('gemini'));
  const [showKey, setShowKey] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [busy, setBusy] = useState('');
  const [formError, setFormError] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [rowStatus, setRowStatus] = useState({}); // id -> { busy, result }

  // Live Playground state
  const [playTargetId, setPlayTargetId] = useState('');
  const [playPrompt, setPlayPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [playPending, setPlayPending] = useState(null);
  const [playReply, setPlayReply] = useState(null);
  const [playError, setPlayError] = useState('');
  const playAbort = useRef(null);

  const selectedProvider = AI_PROVIDERS[form.provider] ?? AI_PROVIDERS.gemini;
  const visibleProviders = useMemo(
    () => PROVIDER_LIST.filter((p) => p.category === category),
    [category],
  );
  const modelSuggestions = useMemo(() => {
    const merged = new Set([...(discoveredModels ?? []), ...(selectedProvider.models ?? [])]);
    return [...merged];
  }, [discoveredModels, selectedProvider]);

  const pickProvider = (providerId) => {
    const p = AI_PROVIDERS[providerId];
    if (!p) return;
    setCategory(p.category);
    setForm(emptyDraft(providerId));
    setDiscoveredModels([]);
    setFormError('');
    setTestResult(null);
    setShowKey(false);
  };

  const editExisting = (item) => {
    const p = AI_PROVIDERS[item.provider];
    if (p) setCategory(p.category);
    setForm({
      id: item.id,
      provider: item.provider,
      label: item.label,
      apiKey: item.apiKey ?? '',
      baseUrl: item.baseUrl || p?.baseUrl || '',
      format: item.format || p?.format || 'openai',
      defaultModel: item.defaultModel || p?.defaultModel || '',
      storageMode: item.storageMode || 'local',
      syncToGateway: false,
    });
    setDiscoveredModels([]);
    setFormError('');
    setTestResult(null);
    document.getElementById('import-ai-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setFormError('');
    const result = await discoverProviderModels(form);
    setDiscovering(false);
    setDiscoveredModels(result.models);
    if (result.ok) {
      if (result.models.length && !result.models.includes(form.defaultModel)) {
        setForm((prev) => ({ ...prev, defaultModel: result.models[0] }));
      }
      toast.show({ message: `Found ${result.models.length} model${result.models.length === 1 ? '' : 's'} on ${selectedProvider.label}.` });
    } else {
      setFormError(result.error || 'Could not list models automatically; type the model name manually.');
    }
  };

  const validation = useMemo(
    () => validateProviderKey(form.provider, form.apiKey, form.baseUrl),
    [form.provider, form.apiKey, form.baseUrl],
  );

  const handleTestDraft = async () => {
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }
    setBusy('test');
    setFormError('');
    setTestResult(null);
    const res = await testAiConnection(form, form.defaultModel);
    setBusy('');
    if (res.ok) setTestResult(res);
    else setFormError(res.error);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }
    if (!form.defaultModel.trim()) {
      setFormError('Choose or enter a model ID (for example gemini-2.5-flash or llama3.3).');
      return;
    }

    setBusy('save');
    setFormError('');

    let cloudKeyId = null;
    if (form.syncToGateway && hasPremium && selectedProvider.gatewayProvider && form.apiKey.trim()) {
      const gwRes = await engine('gateway_key_add', {
        provider: selectedProvider.gatewayProvider,
        label: form.label.trim() || selectedProvider.label,
        key: form.apiKey.trim(),
      });
      if (gwRes.error) {
        toast.show({ message: `Saved locally, but Cloud Gateway sync failed: ${gwRes.error}`, tone: 'error' });
      } else {
        cloudKeyId = gwRes.key?.id ?? null;
      }
    }

    const saved = upsertImportedModel({
      ...form,
      verifiedAt: testResult?.ok ? new Date().toISOString() : undefined,
      latencyMs: testResult?.ok ? testResult.latencyMs : undefined,
      cloudKeyId,
    });
    setBusy('');
    setForm(emptyDraft(form.provider));
    setTestResult(null);
    setPlayTargetId(saved.id);
    toast.show({ message: `${saved.label} (${saved.defaultModel}) is ready across VibeAssist.` });
  };

  const testSavedRow = async (item) => {
    setRowStatus((prev) => ({ ...prev, [item.id]: { busy: true } }));
    const res = await testAiConnection(item);
    if (res.ok) {
      upsertImportedModel({ ...item, verifiedAt: new Date().toISOString(), latencyMs: res.latencyMs, lastError: null });
      setRowStatus((prev) => ({ ...prev, [item.id]: { busy: false, ok: true, text: `${res.latencyMs} ms` } }));
    } else {
      upsertImportedModel({ ...item, lastError: res.error });
      setRowStatus((prev) => ({ ...prev, [item.id]: { busy: false, ok: false, text: res.error } }));
    }
  };

  const copyCommand = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: 'Command copied.' });
    } catch {
      toast.show({ message: 'Copy blocked by browser.', tone: 'error' });
    }
  };

  const playgroundConn = models.find((m) => m.id === playTargetId) ?? active ?? models[0] ?? null;

  const runPlayground = async (e) => {
    e.preventDefault();
    if (!playgroundConn || !playPrompt.trim() || playPending) return;
    const controller = new AbortController();
    playAbort.current = controller;
    setPlayPending({ since: Date.now() });
    setPlayReply(null);
    setPlayError('');
    try {
      const res = await completeWithUserAi({
        connection: playgroundConn,
        system: 'You are a concise, practical product and engineering advisor inside VibeAssist.',
        messages: [{ role: 'user', content: playPrompt.trim() }],
        maxTokens: 600,
        signal: controller.signal,
      });
      setPlayReply(res);
    } catch (err) {
      if (err?.name !== 'AbortError') setPlayError(err?.message || 'Prompt failed.');
    } finally {
      setPlayPending(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Import Your AI"
        description="Bring your own API keys for Gemini, Claude, OpenAI, frontier routers, or connect 100% private local models (Ollama, LM Studio, vLLM)."
      >
        <Link to="/publishing?tab=security" className="btn btn-secondary">
          <ShieldCheck aria-hidden="true" /> Security Lab
        </Link>
        {hasPremium && (
          <Link to="/orchestrator#gateway" className="btn btn-ghost">
            Smart Token Gateway
          </Link>
        )}
      </PageHeader>

      <div className="stat-grid section" style={{ marginTop: 0 }}>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">Connected AI Models</span>
            <Cpu className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value">{models.length}</p>
          <p className="stat-change">{models.filter((m) => AI_PROVIDERS[m.provider]?.local).length} local · {models.filter((m) => !AI_PROVIDERS[m.provider]?.local).length} cloud BYOK</p>
        </div>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">Active Default Engine</span>
            <Sparkles className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value" style={{ fontSize: 18 }}>{active ? active.label : 'VibeAssist Cloud'}</p>
          <p className="stat-change">{active ? active.defaultModel : 'Uses shared Claude when Premium'}</p>
        </div>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">Key Custody</span>
            <Lock className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value" style={{ fontSize: 18 }}>Browser-Direct</p>
          <p className="stat-change">Requests go directly from your browser to your provider or localhost</p>
        </div>
      </div>

      <section className="card section" id="import-ai-form" aria-labelledby="import-form-title">
        <div className="section-header">
          <div>
            <h2 id="import-form-title" className="card-title">{form.id ? `Edit ${form.label}` : 'Connect a new AI provider or local server'}</h2>
            <p className="card-subtitle">Pick a provider below, paste your API key or local endpoint, verify live latency, and save.</p>
          </div>
          <div className="segmented segmented--wrap" role="group" aria-label="Provider category">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => pickProvider(PROVIDER_LIST.find((p) => p.category === c.id)?.id || 'gemini')}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="provider-picker-grid" role="group" aria-label="AI Providers">
          {visibleProviders.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`provider-tile${form.provider === p.id ? ' is-selected' : ''}`}
              aria-pressed={form.provider === p.id}
              onClick={() => pickProvider(p.id)}
            >
              <div className="provider-tile-head">
                {p.local ? <HardDrive aria-hidden="true" /> : <Cloud aria-hidden="true" />}
                <strong>{p.label}</strong>
                <span className={`badge${p.local ? ' badge--success' : ' badge--cobalt'}`}>{p.local ? 'Local' : p.format}</span>
              </div>
              <p className="field-help">{p.summary}</p>
            </button>
          ))}
        </div>

        <form onSubmit={handleSave} noValidate style={{ marginTop: 18 }}>
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="ai-label">Connection nickname</label>
              <input
                id="ai-label"
                className="input-field"
                maxLength={60}
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder={selectedProvider.label}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="ai-model">Default model ID</label>
              <div className="inline-form">
                <input
                  id="ai-model"
                  className="input-field"
                  style={{ flex: 1 }}
                  list="ai-model-options"
                  value={form.defaultModel}
                  onChange={(e) => { setForm({ ...form, defaultModel: e.target.value }); setTestResult(null); }}
                  placeholder={selectedProvider.defaultModel}
                  spellCheck="false"
                  autoComplete="off"
                />
                <datalist id="ai-model-options">
                  {modelSuggestions.map((m) => <option key={m} value={m} />)}
                </datalist>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleDiscover} disabled={discovering}>
                  <RefreshCw aria-hidden="true" /> {discovering ? 'Scanning…' : selectedProvider.local ? 'Detect local models' : 'Fetch models'}
                </button>
              </div>
              {modelSuggestions.length > 0 && (
                <div className="chip-row" aria-label="Quick model picks">
                  {modelSuggestions.slice(0, 6).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`chip-btn${form.defaultModel === m ? ' is-active' : ''}`}
                      onClick={() => { setForm({ ...form, defaultModel: m }); setTestResult(null); }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <div className="flex-between">
                <label className="field-label" htmlFor="ai-key">
                  {selectedProvider.requiresKey ? `${selectedProvider.label} API Key` : 'Bearer Token (optional for local)'}
                </label>
                {selectedProvider.docsUrl && (
                  <a href={selectedProvider.docsUrl} target="_blank" rel="noreferrer" className="field-help">
                    Get {selectedProvider.label} key
                  </a>
                )}
              </div>
              <div className="inline-form">
                <input
                  id="ai-key"
                  type={showKey ? 'text' : 'password'}
                  className="input-field"
                  style={{ flex: 1 }}
                  value={form.apiKey}
                  onChange={(e) => { setForm({ ...form, apiKey: e.target.value }); setTestResult(null); setFormError(''); }}
                  placeholder={selectedProvider.keyPlaceholder}
                  autoComplete="off"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
              {validation.warning && <p className="field-help" style={{ color: 'var(--app-warning)' }}>{validation.warning}</p>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="ai-base-url">API Base URL</label>
              <input
                id="ai-base-url"
                className="input-field"
                value={form.baseUrl}
                onChange={(e) => { setForm({ ...form, baseUrl: e.target.value }); setTestResult(null); }}
                placeholder={selectedProvider.baseUrl}
                spellCheck="false"
              />
              {form.provider === 'custom_local' && (
                <div className="page-actions" style={{ marginTop: 6 }}>
                  <label className="field-help" htmlFor="ai-custom-format">Protocol:</label>
                  <select
                    id="ai-custom-format"
                    className="input-field input-sm"
                    value={form.format}
                    onChange={(e) => setForm({ ...form, format: e.target.value })}
                  >
                    <option value="openai">OpenAI-compatible (/chat/completions)</option>
                    <option value="anthropic">Anthropic-compatible (/messages)</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {selectedProvider.local && (
            <div style={{ marginBottom: 14 }}>
              <Notice tone="info" title={`Running ${selectedProvider.label} from your browser`}>
                <p>If your browser blocks localhost requests due to CORS, start your local server with wildcard origins enabled:</p>
                {form.provider === 'ollama' ? (
                  <div className="stack-xs" style={{ marginTop: 6 }}>
                    <div className="key-row">
                      <code>OLLAMA_ORIGINS=&quot;*&quot; ollama serve</code>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyCommand('OLLAMA_ORIGINS="*" ollama serve')}><Copy aria-hidden="true" /> macOS/Linux</button>
                    </div>
                    <div className="key-row">
                      <code>$env:OLLAMA_ORIGINS=&quot;*&quot;; ollama serve</code>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyCommand('$env:OLLAMA_ORIGINS="*"; ollama serve')}><Copy aria-hidden="true" /> PowerShell</button>
                    </div>
                  </div>
                ) : (
                  <p className="field-help" style={{ marginTop: 4 }}>Enable <strong>CORS</strong> in LM Studio → Developer → Local Server Settings before clicking Test Connection.</p>
                )}
              </Notice>
            </div>
          )}

          <div className="grid-2" style={{ alignItems: 'center' }}>
            <div className="field">
              <span className="field-label">Browser storage mode</span>
              <div className="segmented" role="group" aria-label="Storage mode">
                <button type="button" aria-pressed={form.storageMode === 'local'} onClick={() => setForm({ ...form, storageMode: 'local' })}>
                  Remember on this device
                </button>
                <button type="button" aria-pressed={form.storageMode === 'session'} onClick={() => setForm({ ...form, storageMode: 'session' })}>
                  Session only (tab close wipes)
                </button>
              </div>
            </div>

            {hasPremium && selectedProvider.gatewayProvider && form.apiKey.trim() && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.syncToGateway}
                  onChange={(e) => setForm({ ...form, syncToGateway: e.target.checked })}
                />
                <span>Also store encrypted copy in Server Gateway Vault (for GitHub Actions &amp; Engine)</span>
              </label>
            )}
          </div>

          {formError && <div style={{ marginBottom: 12 }}><Notice tone="error">{formError}</Notice></div>}
          {testResult?.ok && (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="success" title="Live connection verified">
                {selectedProvider.label} responded with <code>{testResult.reply}</code> using <code>{testResult.model}</code> in <strong>{testResult.latencyMs} ms</strong>.
              </Notice>
            </div>
          )}

          <div className="page-actions">
            <button type="submit" className="btn btn-primary" disabled={busy !== ''}>
              <KeyRound aria-hidden="true" /> {busy === 'save' ? 'Saving…' : form.id ? 'Update AI connection' : 'Save & activate AI'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleTestDraft} disabled={busy !== ''} aria-busy={busy === 'test'}>
              <PlugZap aria-hidden="true" /> {busy === 'test' ? 'Testing live call…' : 'Test connection'}
            </button>
            {form.id && (
              <button type="button" className="btn btn-ghost" onClick={() => { setForm(emptyDraft('gemini')); setTestResult(null); setFormError(''); }}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card section" aria-labelledby="connected-models-title">
        <div className="section-header">
          <div>
            <h2 id="connected-models-title" className="card-title">Connected AI Vault</h2>
            <p className="card-subtitle">Manage your imported keys and local servers, test response latency, or choose your global default.</p>
          </div>
          {models.length > 0 && (
            <ConfirmButton
              label="Clear all keys"
              question="Remove every locally stored AI key and reset routing to VibeAssist Cloud?"
              busyLabel="Clearing…"
              onConfirm={() => { clearBrowserAiVault(); toast.show({ message: 'Cleared all browser-stored AI keys.' }); }}
            />
          )}
        </div>

        {models.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 12px' }}>
            <h3>No custom AI models imported yet</h3>
            <p>Add a Gemini, Claude, OpenAI, or local Ollama model above to power VibeAssist with your own limits and zero per-seat markup.</p>
          </div>
        ) : (
          <ul className="rule-list">
            {models.map((item) => {
              const p = AI_PROVIDERS[item.provider];
              const isDefault = active?.id === item.id;
              const status = rowStatus[item.id];
              return (
                <li key={item.id}>
                  <div style={{ minWidth: 0 }}>
                    <div className="page-actions" style={{ gap: 8 }}>
                      <strong>{item.label}</strong>
                      <span className={`badge${p?.local ? ' badge--success' : ' badge--cobalt'}`}>{p?.label ?? item.provider}</span>
                      {isDefault && <span className="badge badge--acid">Default</span>}
                      {item.storageMode === 'session' && <span className="badge">Session only</span>}
                    </div>
                    <p className="field-help" style={{ marginTop: 4 }}>
                      Model: <code>{item.defaultModel}</code> · Key: <code>{item.keyMask}</code> · Endpoint: <code>{item.baseUrl}</code>
                      {item.latencyMs ? ` · ${item.latencyMs} ms` : ''}
                    </p>
                    {status && !status.busy && (
                      <p className="field-help" style={{ color: status.ok ? 'var(--app-success)' : 'var(--app-danger)', marginTop: 2 }}>
                        {status.ok ? <><CheckCircle2 className="inline-icon" aria-hidden="true" /> Verified ({status.text})</> : status.text}
                      </p>
                    )}
                  </div>
                  <div className="page-actions">
                    {!isDefault && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          saveAiRouting({ ...routing, default: item.id });
                          toast.show({ message: `${item.label} is now the default AI.` });
                        }}
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => testSavedRow(item)}
                      disabled={Boolean(status?.busy)}
                    >
                      <Zap aria-hidden="true" /> {status?.busy ? 'Testing…' : 'Test'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => editExisting(item)}>Edit</button>
                    <ConfirmButton
                      label={<><Trash2 aria-hidden="true" /> Remove</>}
                      question={`Remove ${item.label}?`}
                      busyLabel="Removing…"
                      onConfirm={() => { removeImportedModel(item.id); toast.show({ message: `Removed ${item.label}.` }); }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid-2 section" style={{ alignItems: 'start' }}>
        <section className="card" aria-labelledby="routing-title">
          <h2 id="routing-title" className="card-title">Per-Section AI Routing</h2>
          <p className="card-subtitle">Route high-reasoning tasks to Claude or Gemini Pro, and bulk chat condensing or code checks to fast/local models.</p>
          <div className="stack-sm" style={{ marginTop: 14 }}>
            {AI_FEATURE_SLOTS.map((slot) => (
              <div key={slot.key} className="routing-row">
                <div>
                  <label className="field-label" htmlFor={`route-${slot.key}`}>{slot.label}</label>
                  <p className="field-help">{slot.desc}</p>
                </div>
                <select
                  id={`route-${slot.key}`}
                  className="input-field input-sm"
                  value={routing?.[slot.key] ?? (slot.key === 'default' ? 'cloud' : 'inherit')}
                  onChange={(e) => {
                    saveAiRouting({ ...routing, [slot.key]: e.target.value });
                    toast.show({ message: `Updated ${slot.label} engine.` });
                  }}
                >
                  {slot.key !== 'default' && <option value="inherit">Use Platform Default</option>}
                  <option value="cloud">VibeAssist Cloud (Claude · Premium)</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} · {m.defaultModel}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="playground-title">
          <h2 id="playground-title" className="card-title">Live Model Test Bench</h2>
          <p className="card-subtitle">Send a real test prompt to verify formatting, latency, and local inference speed.</p>

          {models.length === 0 ? (
            <p className="field-help" style={{ marginTop: 12 }}>Import a cloud API key or local Ollama/LM Studio model to run prompts here.</p>
          ) : (
            <form onSubmit={runPlayground} style={{ marginTop: 12 }}>
              <div className="field">
                <label className="field-label" htmlFor="play-model">Target connection</label>
                <select
                  id="play-model"
                  className="input-field"
                  value={playgroundConn?.id ?? ''}
                  onChange={(e) => setPlayTargetId(e.target.value)}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} · {m.defaultModel}</option>
                  ))}
                </select>
              </div>

              <div className="chip-row" style={{ marginBottom: 10 }}>
                {SAMPLE_PROMPTS.map((sp, idx) => (
                  <button key={idx} type="button" className="chip-btn" onClick={() => setPlayPrompt(sp)}>
                    Sample {idx + 1}
                  </button>
                ))}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="play-prompt">Prompt</label>
                <textarea
                  id="play-prompt"
                  className="input-field"
                  rows={3}
                  value={playPrompt}
                  onChange={(e) => setPlayPrompt(e.target.value)}
                />
              </div>

              <div className="page-actions">
                {playPending ? (
                  <>
                    <button type="button" className="btn btn-primary" disabled aria-busy="true">
                      <span className="spinner spinner--light" /> Running… <Elapsed since={playPending.since} />
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => playAbort.current?.abort()}>Cancel</button>
                  </>
                ) : (
                  <button type="submit" className="btn btn-primary" disabled={!playPrompt.trim()}>
                    <Play aria-hidden="true" /> Run prompt
                  </button>
                )}
              </div>

              {playError && <div style={{ marginTop: 12 }}><Notice tone="error">{playError}</Notice></div>}
              {playReply && (
                <div className="playground-output" style={{ marginTop: 14 }}>
                  <p className="field-help">
                    Answered by <strong>{playReply.model}</strong> in <strong>{playReply.latencyMs} ms</strong>
                    {(playReply.usage?.input || playReply.usage?.output)
                      ? ` · ${playReply.usage.input} in / ${playReply.usage.output} out tokens`
                      : ''}
                  </p>
                  <pre className="code-block" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{playReply.text}</pre>
                </div>
              )}
            </form>
          )}
        </section>
      </div>
    </>
  );
}
