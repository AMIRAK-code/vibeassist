import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, AppWindow, Copy, RefreshCw } from 'lucide-react';
import { useToast } from '../components/ui/toast-context';
import { callFunction, friendlyError, supabase, supabasePublishableKey, supabaseUrl } from '../lib/supabase';
import { formatDateTime } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';

const exampleRequest = (key) => `curl -X POST "${supabaseUrl}/rest/v1/rpc/ingest_metrics" \\
  -H "apikey: ${supabasePublishableKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"p_api_key": "${key}", "p_rows": [{"date": "2026-10-01", "revenue": 120.50, "organic_downloads": 40, "paid_downloads": 12, "purchases": 5, "active_users": 800}]}'`;

// Inline "are you sure" for actions that can't be undone from here
function ConfirmButton({ label, question, busyLabel, busy, onConfirm, disabled }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className="btn btn-ghost" onClick={() => setAsking(true)} disabled={disabled}>{label}</button>;
  }
  return (
    <span className="inline-confirm" role="group" aria-label={question}>
      {question}
      <button type="button" className="btn btn-danger btn-sm" onClick={async () => { await onConfirm(); setAsking(false); }} disabled={busy}>
        {busy ? busyLabel : label}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
    </span>
  );
}

export default function Integrations() {
  const toast = useToast();
  const [integrations, setIntegrations] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const [newKey, setNewKey] = useState(''); // shown once, right after it is created
  const [stripeKey, setStripeKey] = useState('');
  const [busy, setBusy] = useState('');
  const [stripeError, setStripeError] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    const [connections, keys] = await Promise.all([
      supabase.from('integrations').select('provider, status, account_label, last_error, last_synced_at'),
      // The key hash is not readable, so name the columns instead of select('*')
      supabase.from('api_keys').select('key_prefix, created_at, last_used_at').is('revoked_at', null).maybeSingle(),
    ]);
    if (connections.error) setLoadError(friendlyError(connections.error, 'Could not load your connections.'));
    else setLoadError('');
    setIntegrations(Object.fromEntries((connections.data ?? []).map((row) => [row.provider, row])));
    setActiveKey(keys.data ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stripe = integrations?.stripe;
  const stripeConnected = stripe?.status === 'connected';

  const stripeAction = async (action, extra = {}) => {
    if (busy) return;
    setBusy(`stripe-${action}`);
    setStripeError('');
    const { data, status } = await callFunction('stripe-sync', { action, ...extra });
    setBusy('');
    if (status !== 200) {
      setStripeError(data?.error ?? 'Stripe request failed. Try again.');
    } else if (action === 'disconnect') {
      toast.show({ message: 'Stripe disconnected. Revenue already imported stays on your Overview.' });
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
    else setNewKey(data);
    await load();
  };

  const revokeKey = async () => {
    setBusy('revoke');
    const { error } = await supabase.rpc('revoke_api_key');
    setBusy('');
    setNewKey('');
    if (error) toast.show({ message: friendlyError(error, 'Could not revoke the key. Try again.'), tone: 'error' });
    else toast.show({ message: 'Key revoked. Apps using it can no longer send numbers.' });
    await load();
  };

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: `${what} copied.` });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser. Select the text and copy it instead.', tone: 'error' });
    }
  };

  return (
    <>
      <PageHeader title="Data sources" description="Bring numbers in automatically instead of typing them. Everything lands on your Overview." />

      {loadError && <div className="section"><Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice></div>}

      <div className="source-list">
        <section className="card" aria-labelledby="stripe-title">
          <div className="source-head">
            <CreditCard aria-hidden="true" />
            <div>
              <h2 id="stripe-title" className="card-title">Stripe</h2>
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
              <p className="field-help" style={{ marginTop: 12 }}>Last synced {stripe.last_synced_at ? formatDateTime(stripe.last_synced_at) : 'never'}. Sync again whenever you want fresh numbers.</p>
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
            <form
              style={{ marginTop: 14 }}
              onSubmit={(e) => {
                e.preventDefault();
                stripeAction('connect', { key: stripeKey });
              }}
            >
              {stripe?.status === 'error' && <div style={{ marginBottom: 12 }}><Notice tone="error">{stripe.last_error} Paste a working key to reconnect.</Notice></div>}
              <div className="field">
                <label className="field-label" htmlFor="stripe-key">Restricted key</label>
                <input id="stripe-key" type="password" className="input-field" placeholder="rk_live_…" autoComplete="off" spellCheck="false"
                  value={stripeKey} onChange={(e) => setStripeKey(e.target.value)} aria-invalid={Boolean(stripeError)} aria-describedby="stripe-key-help" />
                <span id="stripe-key-help" className="field-help">
                  In Stripe, open Developers → API keys → Create restricted key and give it read access to Balance only. It's stored encrypted and only used to read balance transactions.
                </span>
              </div>
              {stripeError && <div style={{ marginBottom: 12 }}><Notice tone="error">{stripeError}</Notice></div>}
              <button type="submit" className="btn btn-primary" disabled={Boolean(busy) || !stripeKey.trim()} aria-busy={busy === 'stripe-connect'}>
                {busy === 'stripe-connect' ? <><span className="spinner spinner--light" /> Connecting and importing…</> : 'Connect Stripe'}
              </button>
            </form>
          )}
          {stripeConnected && stripeError && <div style={{ marginTop: 12 }}><Notice tone="error">{stripeError}</Notice></div>}
        </section>

        <section className="card" aria-labelledby="api-title">
          <div className="source-head">
            <AppWindow aria-hidden="true" />
            <div>
              <h2 id="api-title" className="card-title">Custom API</h2>
              <p className="card-subtitle">Send daily numbers from your own app, backend or a script with one HTTP request.</p>
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
              <details className="context-preview">
                <summary>Example request</summary>
                <pre className="code-block">{exampleRequest(newKey || 'YOUR_API_KEY')}</pre>
                <p className="field-help">Send up to 366 days per request. A day you send again replaces what this API sent before for that day.</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(exampleRequest(newKey || 'YOUR_API_KEY'), 'Example request')}><Copy aria-hidden="true" /> Copy example</button>
              </details>
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

        <p className="field-help">
          Google Play Console and App Store Connect can't be connected yet. Until they can, send those numbers through the Custom API or add them by hand on the Overview.
        </p>
      </div>
    </>
  );
}
