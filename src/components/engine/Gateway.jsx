import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../ui/toast-context';
import { friendlyError, supabase, supabaseUrl } from '../../lib/supabase';
import { engine, PROVIDERS, since } from '../../lib/engine';
import { formatCount } from '../../lib/format';
import Notice from '../ui/Notice';
import ConfirmButton from '../ui/ConfirmButton';

const EMPTY_ROUTE = { alias: '', api_format: 'openai', targets: [{ provider_key_id: '', model: '' }] };

function RouteForm({ initial, providerKeys, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const usable = providerKeys.filter((k) => PROVIDERS[k.provider].format === form.api_format);
  const setTarget = (i, patch) => setForm({ ...form, targets: form.targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const submit = (e) => {
    e.preventDefault();
    const alias = form.alias.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(alias)) return setError('Use 1 to 40 lowercase letters, numbers, dots, dashes or underscores.');
    const targets = form.targets.filter((t) => t.provider_key_id && t.model.trim()).map((t) => ({
      provider_key_id: t.provider_key_id, provider: providerKeys.find((k) => k.id === t.provider_key_id)?.provider, model: t.model.trim(),
    }));
    if (!targets.length) return setError('Add at least one target with a key and a model.');
    if (targets.some((t) => PROVIDERS[t.provider]?.format !== form.api_format)) return setError('Every target must speak the route\'s format.');
    setError('');
    onSave({ alias, api_format: form.api_format, targets });
  };

  return (
    <form className="card card--raised" onSubmit={submit} noValidate>
      <div className="grid-2">
        <div className="field">
          <label className="field-label" htmlFor="route-alias">Route name (your apps send this as "model")</label>
          <input id="route-alias" className="input-field" value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })} placeholder="smart-default" spellCheck="false" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="route-format">Format</label>
          <select id="route-format" className="input-field" value={form.api_format} onChange={(e) => setForm({ ...form, api_format: e.target.value, targets: [{ provider_key_id: '', model: '' }] })}>
            <option value="openai">OpenAI (/v1/chat/completions)</option>
            <option value="anthropic">Anthropic (/v1/messages)</option>
          </select>
        </div>
      </div>
      <p className="field-label" style={{ marginTop: 4 }}>Targets, tried in order</p>
      {form.targets.map((t, i) => (
        <div className="inline-form" key={i}>
          <span className="field-help">{i + 1}.</span>
          <select className="input-field input-sm" aria-label={`Target ${i + 1} key`} value={t.provider_key_id} onChange={(e) => setTarget(i, { provider_key_id: e.target.value })}>
            <option value="">{usable.length ? 'Pick a key…' : 'Add a provider key first'}</option>
            {usable.map((k) => <option key={k.id} value={k.id}>{k.label} ({PROVIDERS[k.provider].label})</option>)}
          </select>
          <input className="input-field input-sm" style={{ width: 220 }} aria-label={`Target ${i + 1} model`} value={t.model} onChange={(e) => setTarget(i, { model: e.target.value })}
            placeholder={PROVIDERS[providerKeys.find((k) => k.id === t.provider_key_id)?.provider]?.example ?? 'model name'} spellCheck="false" />
          {form.targets.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, targets: form.targets.filter((_, j) => j !== i) })}>Remove</button>}
        </div>
      ))}
      {form.targets.length < 4 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, targets: [...form.targets, { provider_key_id: '', model: '' }] })}><Plus aria-hidden="true" /> Add a fallback</button>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="page-actions" style={{ marginTop: 10 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save route'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

// Smart Token Gateway: the user's own provider keys, routes with fallbacks, the keys their apps
// use to call it, and what it has been doing
export default function Gateway({ providerKeys, routes, gatewayKeys, usage, onChanged }) {
  const toast = useToast();
  const [keyForm, setKeyForm] = useState(null); // { provider, label, key } while adding
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState('');
  const baseUrl = `${supabaseUrl}/functions/v1/gateway/v1`;

  const addProviderKey = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await engine('gateway_key_add', keyForm);
    setSaving(false);
    if (result.error) return setError(result.error);
    setError('');
    setKeyForm(null);
    toast.show({ message: `${PROVIDERS[result.key.provider].label} key saved, encrypted.` });
    onChanged();
  };

  const saveRoute = async (values) => {
    setSaving(true);
    const query = editing === 'new' ? supabase.from('gateway_routes').insert(values) : supabase.from('gateway_routes').update(values).eq('id', editing);
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) return toast.show({ message: saveError.code === '23505' ? 'You already have a route with that name.' : friendlyError(saveError, 'Could not save the route.'), tone: 'error' });
    setEditing(null);
    onChanged();
  };

  const createKey = async () => {
    const { data, error: keyError } = await supabase.rpc('create_scoped_api_key', { p_scope: 'gateway', p_label: `Gateway key ${gatewayKeys.length + 1}` });
    if (keyError) return toast.show({ message: friendlyError(keyError, 'Could not create a key.'), tone: 'error' });
    setNewKey(data);
    onChanged();
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: 'Copied.' });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser.', tone: 'error' });
    }
  };

  const tokens = usage.reduce((n, u) => n + (u.input_tokens ?? 0) + (u.output_tokens ?? 0), 0);
  const fallbacks = usage.filter((u) => u.fallback_used).length;
  const failures = usage.filter((u) => u.status >= 400).length;

  return (
    <section className="section" id="gateway" aria-labelledby="gateway-title">
      <div className="section-header">
        <h2 id="gateway-title">Smart Token Gateway</h2>
        <Link to="/orchestrator/api" className="btn btn-ghost btn-sm">View API Specs</Link>
      </div>
      <p className="field-help" style={{ marginBottom: 12 }}>
        One endpoint for your apps. Each route tries your providers in order and moves to the next on rate limits, outages and timeouts. Calls use your own provider keys, so they're billed by those providers, not by VibeAssist.
      </p>
      {error && <div style={{ marginBottom: 10 }}><Notice tone="error">{error}</Notice></div>}

      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">Provider keys</h3>
          {providerKeys.length === 0 && <p className="muted" style={{ marginTop: 6 }}>No keys yet. An Anthropic key here is also used for your engine reviews (up to 50 a day).</p>}
          <ul className="rule-list">
            {providerKeys.map((k) => (
              <li key={k.id}>
                <div><strong>{k.label}</strong><p className="field-help">{PROVIDERS[k.provider].label} · {k.key_prefix}{k.last_used_at ? ` · used ${since(k.last_used_at)}` : ''}{k.last_error ? ` · last problem: ${k.last_error}` : ''}</p></div>
                <ConfirmButton label={<><Trash2 aria-hidden="true" /> Remove</>} question="Remove this key? Routes that use it skip it." busyLabel="Removing…" onConfirm={async () => { await engine('gateway_key_remove', { id: k.id }); onChanged(); }} />
              </li>
            ))}
          </ul>
          {keyForm ? (
            <form className="inline-form" onSubmit={addProviderKey}>
              <select className="input-field input-sm" aria-label="Provider" value={keyForm.provider} onChange={(e) => setKeyForm({ ...keyForm, provider: e.target.value })}>
                {Object.entries(PROVIDERS).map(([value, p]) => <option key={value} value={value}>{p.label}</option>)}
              </select>
              <input className="input-field input-sm" aria-label="Label" placeholder="Label" value={keyForm.label} onChange={(e) => setKeyForm({ ...keyForm, label: e.target.value })} />
              <input className="input-field input-sm" style={{ width: 200 }} type="password" aria-label="API key" placeholder="API key" autoComplete="off" value={keyForm.key} onChange={(e) => setKeyForm({ ...keyForm, key: e.target.value })} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !keyForm.key.trim()}>{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setKeyForm(null)}>Cancel</button>
            </form>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setKeyForm({ provider: 'anthropic', label: '', key: '' })}><KeyRound aria-hidden="true" /> Add a provider key</button>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Keys for your apps</h3>
          <p className="field-help">Send one as <code>Authorization: Bearer …</code> (OpenAI SDKs) or <code>x-api-key</code> (Anthropic SDKs), with base URL:</p>
          <div className="key-row"><code>{baseUrl}</code><button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(baseUrl)}><Copy aria-hidden="true" /> Copy</button></div>
          {newKey && (
            <div style={{ marginTop: 10 }}>
              <Notice tone="warning" title="Copy your key now. It won't be shown again.">
                <div className="key-row"><code>{newKey}</code><button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(newKey)}><Copy aria-hidden="true" /> Copy</button></div>
              </Notice>
            </div>
          )}
          <ul className="rule-list">
            {gatewayKeys.map((k) => (
              <li key={k.id}>
                <div><strong>{k.label ?? 'Gateway key'}</strong><p className="field-help">{k.key_prefix}… · {k.last_used_at ? `used ${since(k.last_used_at)}` : 'not used yet'}</p></div>
                <ConfirmButton label="Revoke" question="Revoke this key? Apps using it stop working." busyLabel="Revoking…" onConfirm={async () => { await supabase.rpc('revoke_scoped_api_key', { p_id: k.id }); setNewKey(''); onChanged(); }} />
              </li>
            ))}
          </ul>
          {gatewayKeys.length < 5 && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={createKey}><Plus aria-hidden="true" /> Create a gateway key</button>}
        </div>
      </div>

      <div className="section-header" style={{ marginTop: 16 }}>
        <h3>Routes</h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')} disabled={editing !== null || !providerKeys.length}><Plus aria-hidden="true" /> Add route</button>
      </div>
      {editing === 'new' && <RouteForm initial={EMPTY_ROUTE} providerKeys={providerKeys} onSave={saveRoute} onCancel={() => setEditing(null)} saving={saving} />}
      {routes.length === 0 && editing !== 'new' ? (
        <div className="card empty-state"><p>{providerKeys.length ? 'Add a route: a name your apps use as the model, and the providers to try in order.' : 'Add a provider key first, then a route that uses it.'}</p></div>
      ) : (
        <ul className="card card--flush rule-list">
          {routes.map((r) => (
            editing === r.id ? (
              <li key={r.id} style={{ padding: 12 }}><RouteForm initial={r} providerKeys={providerKeys} onSave={saveRoute} onCancel={() => setEditing(null)} saving={saving} /></li>
            ) : (
              <li key={r.id}>
                <div>
                  <strong><code>{r.alias}</code></strong> <span className="badge">{r.api_format === 'openai' ? 'OpenAI format' : 'Anthropic format'}</span>
                  <p className="field-help">{r.targets.map((t) => `${PROVIDERS[t.provider]?.label ?? t.provider}: ${t.model}`).join(' → ')}</p>
                </div>
                <div className="page-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(r.id)} disabled={editing !== null}>Edit</button>
                  <ConfirmButton label="Delete" question={`Delete route ${r.alias}? Apps calling it get an error.`} busyLabel="Deleting…" onConfirm={async () => { await supabase.from('gateway_routes').delete().eq('id', r.id); onChanged(); }} />
                </div>
              </li>
            )
          ))}
        </ul>
      )}

      <p className="field-help" style={{ marginTop: 10 }}>
        Last 7 days: {formatCount(usage.length)} request{usage.length === 1 ? '' : 's'}, {formatCount(tokens)} tokens, {fallbacks} needed a fallback, {failures} failed. Limits: 60 requests a minute, 5,000 a day.
      </p>
    </section>
  );
}
