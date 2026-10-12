import React, { useState } from 'react';
import { CheckCircle2, PlugZap } from 'lucide-react';
import { useToast } from '../ui/toast-context';
import { effectiveAiChoice, engine, PROVIDERS } from '../../lib/engine';
import Notice from '../ui/Notice';

// "Engine AI": which of the user's own provider keys (any of the gateway's providers) and which
// model run the AI checks, or VibeAssist's shared Claude key. Orchestrator remounts it (key) when
// the saved choice changes, so the form always starts from what's saved.
export default function EngineAi({ providerKeys, settings, onChanged, onJump }) {
  const toast = useToast();
  const saved = effectiveAiChoice(settings, providerKeys);
  const [keyId, setKeyId] = useState(saved.keyId);
  const [model, setModel] = useState(saved.model);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tested, setTested] = useState(null);

  const key = providerKeys.find((k) => k.id === keyId) ?? null;
  const provider = key ? PROVIDERS[key.provider] : null;
  const dirty = keyId !== saved.keyId || model.trim() !== saved.model || !settings;

  const save = async () => {
    setError('');
    setTested(null);
    if (key && key.provider !== 'anthropic' && !model.trim()) {
      setError(`Enter the ${provider.label} model the checks should use.`);
      return false;
    }
    const result = await engine('ai_settings_save', { provider_key_id: keyId || null, model: key ? model.trim() : '' });
    if (result.error) {
      setError(result.error);
      return false;
    }
    onChanged();
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy('save');
    const ok = await save();
    setBusy('');
    if (ok) toast.show({ message: key ? `Engine checks now use your ${provider.label} key.` : "Engine checks now use VibeAssist's Claude." });
  };

  // Saves first when there are changes, so the test checks what the engine will really use
  const test = async () => {
    setBusy('test');
    setTested(null);
    if (dirty && !(await save())) {
      setBusy('');
      return;
    }
    const result = await engine('ai_test');
    setBusy('');
    if (result.error) setError(result.error);
    else setTested(result);
  };

  return (
    <section className="section" id="engine-ai" aria-labelledby="engine-ai-title">
      <div className="section-header">
        <h2 id="engine-ai-title">Engine AI</h2>
      </div>
      <form className="card" onSubmit={submit} noValidate>
        <p className="field-help" style={{ marginBottom: 12 }}>
          Red Team, written Context &amp; Drift rules, rule suggestions and Vision Grounding use this AI. With your own key you get up to 50 AI runs a day, billed by your provider; VibeAssist's Claude includes 8 a day with Premium.
        </p>
        <div className="grid-2">
          <div className="field">
            <label className="field-label" htmlFor="engine-ai-key">API key</label>
            <select id="engine-ai-key" className="input-field" value={keyId} onChange={(e) => { setKeyId(e.target.value); setModel(''); setTested(null); setError(''); }}>
              <option value="">VibeAssist's Claude (shared, 8 runs a day)</option>
              {providerKeys.map((k) => <option key={k.id} value={k.id}>{k.label} ({PROVIDERS[k.provider].label} · {k.key_prefix})</option>)}
            </select>
            {!providerKeys.length && (
              <p className="field-help">
                To use your own key, add one in the{' '}
                <button type="button" className="link-button" onClick={() => onJump('gateway')}>Smart Token Gateway</button>
                : Anthropic, OpenAI, OpenRouter, Groq, Google Gemini, Mistral or DeepSeek.
              </p>
            )}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="engine-ai-model">Model</label>
            <input
              id="engine-ai-model"
              className="input-field"
              value={key ? model : ''}
              onChange={(e) => { setModel(e.target.value); setTested(null); }}
              placeholder={key ? `e.g. ${provider.example}` : 'Chosen by VibeAssist'}
              disabled={!key}
              spellCheck="false"
              autoComplete="off"
              aria-describedby="engine-ai-model-help"
            />
            <p className="field-help" id="engine-ai-model-help">
              {!key ? 'The shared key always uses VibeAssist\'s Claude model.'
                : key.provider === 'anthropic' ? 'Leave it empty for VibeAssist\'s default Claude model.'
                  : 'Use a capable model that can answer in JSON. Vision Grounding also needs one that accepts images.'}
            </p>
          </div>
        </div>
        {error && <div style={{ marginBottom: 10 }}><Notice tone="error">{error}</Notice></div>}
        {tested && (
          <p className="save-status" role="status" style={{ marginBottom: 10, color: 'var(--app-success)' }}>
            <CheckCircle2 aria-hidden="true" className="inline-icon" /> {tested.own_key ? `${tested.label} answered with ${tested.model}.` : `VibeAssist's Claude answered (${tested.model}).`} Engine checks are ready.
          </p>
        )}
        <div className="page-actions">
          <button type="submit" className="btn btn-primary" disabled={busy !== '' || !dirty}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn btn-secondary" onClick={test} disabled={busy !== ''} aria-busy={busy === 'test'}>
            <PlugZap aria-hidden="true" /> {busy === 'test' ? 'Testing…' : 'Test connection'}
          </button>
          {!dirty && settings && <span className="save-status">Saved</span>}
        </div>
      </form>
    </section>
  );
}
