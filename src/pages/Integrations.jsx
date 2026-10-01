import React, { useCallback, useEffect, useState } from 'react';
import { Play, AppWindow, Apple, CreditCard, CheckCircle2, AlertTriangle, Copy, RefreshCw } from 'lucide-react';
import { callFunction, friendlyError, supabase, supabasePublishableKey, supabaseUrl } from '../lib/supabase';
import { formatDateTime } from '../lib/format';

function Status({ text, color }) {
  return <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color }}>{text}</span>;
}

function Message({ message }) {
  if (!message) return null;
  return (
    <p role={message.error ? 'alert' : 'status'} style={{ color: message.error ? '#d93025' : 'var(--accent-1)', fontSize: '0.85rem', marginTop: '12px' }}>
      {message.text}
    </p>
  );
}

function ComingSoon({ icon: Icon, color, title, subtitle, description }) {
  return (
    <div className="glass-panel" style={{ opacity: 0.85 }}>
      <div className="flex-between">
        <div className="flex-center gap-4">
          <Icon size={32} color={color} />
          <div>
            <h3>{title}</h3>
            <p className="input-label" style={{ fontSize: '0.8rem' }}>{subtitle}</p>
          </div>
        </div>
        <Status text="Coming soon" color="var(--text-secondary)" />
      </div>
      <p className="mt-4 input-label">{description}</p>
      <p className="input-label" style={{ fontSize: '0.8rem', marginTop: '8px' }}>
        Until then, send these numbers with the Custom API or add them on the dashboard.
      </p>
      <button className="btn btn-secondary w-full mt-4" disabled>Not available yet</button>
    </div>
  );
}

const exampleRequest = (key) => `curl -X POST "${supabaseUrl}/rest/v1/rpc/ingest_metrics" \\
  -H "apikey: ${supabasePublishableKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"p_api_key": "${key}", "p_rows": [{"date": "2026-10-01", "revenue": 120.50, "organic_downloads": 40, "paid_downloads": 12, "purchases": 5, "active_users": 800}]}'`;

// Connection state lives in the database, so it survives reloads and other devices
export default function Integrations() {
  const [integrations, setIntegrations] = useState({});
  const [activeKey, setActiveKey] = useState(null);
  const [newKey, setNewKey] = useState(''); // shown once, right after it is created
  const [stripeKey, setStripeKey] = useState('');
  const [busy, setBusy] = useState('');
  const [stripeMessage, setStripeMessage] = useState(null);
  const [customMessage, setCustomMessage] = useState(null);

  const load = useCallback(async () => {
    const [connections, keys] = await Promise.all([
      supabase.from('integrations').select('provider, status, account_label, last_error, last_synced_at'),
      // The key hash is not readable, so name the columns instead of select('*')
      supabase.from('api_keys').select('key_prefix, created_at, last_used_at').is('revoked_at', null).maybeSingle(),
    ]);
    setIntegrations(Object.fromEntries((connections.data ?? []).map((row) => [row.provider, row])));
    setActiveKey(keys.data ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stripe = integrations.stripe;
  const stripeConnected = stripe?.status === 'connected';
  const customConnected = Boolean(activeKey);

  const stripeAction = async (action, extra = {}) => {
    setBusy(`stripe-${action}`);
    setStripeMessage(null);
    const { data, status } = await callFunction('stripe-sync', { action, ...extra });
    setBusy('');
    if (status !== 200) {
      setStripeMessage({ error: true, text: data?.error ?? 'Stripe request failed. Try again.' });
    } else if (action === 'disconnect') {
      setStripeMessage({ text: 'Stripe disconnected. Revenue already imported stays on your dashboard.' });
    } else {
      setStripeKey('');
      const skipped = data.otherCurrency ? ` ${data.otherCurrency} transactions in other currencies were skipped.` : '';
      const capped = data.truncated ? ' Only the most recent 3,000 transactions were imported.' : '';
      setStripeMessage({ text: `Imported ${data.transactions} transactions across ${data.days} days (${data.currency}).${skipped}${capped}` });
    }
    await load();
  };

  const handleGenerateKey = async () => {
    setBusy('key');
    setCustomMessage(null);
    const { data, error } = await supabase.rpc('create_api_key');
    setBusy('');
    if (error) setCustomMessage({ error: true, text: friendlyError(error, 'Could not create a key. Try again.') });
    else setNewKey(data);
    await load();
  };

  const handleRevokeKey = async () => {
    setBusy('revoke');
    setCustomMessage(null);
    const { error } = await supabase.rpc('revoke_api_key');
    setBusy('');
    setNewKey('');
    if (error) setCustomMessage({ error: true, text: friendlyError(error, 'Could not revoke the key. Try again.') });
    else setCustomMessage({ text: 'Key revoked. Apps using it can no longer send data.' });
    await load();
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCustomMessage({ text: 'Copied to the clipboard.' });
    } catch {
      setCustomMessage({ error: true, text: 'Copy failed. Select the text and copy it by hand.' });
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h2><span className="text-gradient">Integrations</span> & Data Sources</h2>
        <p className="input-label mt-4">Connect your sources so the dashboard and AI advisor work with your real numbers.</p>
      </div>

      <div className="grid-2 mt-4">

        {/* Stripe */}
        <div className="glass-panel">
          <div className="flex-between">
            <div className="flex-center gap-4">
              <CreditCard size={32} color="#6772E5" />
              <div>
                <h3>Stripe</h3>
                <p className="input-label" style={{ fontSize: '0.8rem' }}>{stripeConnected ? stripe.account_label : 'Web Payments'}</p>
              </div>
            </div>
            {stripeConnected && <CheckCircle2 color="#6772E5" aria-label="Connected" />}
            {stripe?.status === 'error' && <AlertTriangle color="#d93025" aria-label="Needs attention" />}
          </div>
          <p className="mt-4 input-label">Imports daily revenue, refunds, fees and purchase counts for the last 90 days.</p>

          {stripeConnected ? (
            <>
              <p className="input-label" style={{ fontSize: '0.8rem', marginTop: '8px' }}>
                Last synced {stripe.last_synced_at ? formatDateTime(stripe.last_synced_at) : 'never'}
              </p>
              <div className="flex-center gap-4 mt-4">
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => stripeAction('sync')} disabled={Boolean(busy)}>
                  <RefreshCw size={16} /> {busy === 'stripe-sync' ? 'Syncing…' : 'Sync now'}
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => stripeAction('disconnect')} disabled={Boolean(busy)}>
                  {busy === 'stripe-disconnect' ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </>
          ) : (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                stripeAction('connect', { key: stripeKey });
              }}
            >
              {stripe?.status === 'error' && (
                <p role="alert" style={{ color: '#d93025', fontSize: '0.85rem', marginBottom: '8px' }}>{stripe.last_error} Paste a working key to reconnect.</p>
              )}
              <div className="input-group">
                <label className="input-label" htmlFor="stripe-key">Restricted key</label>
                <input
                  id="stripe-key"
                  type="password"
                  className="input-field"
                  placeholder="rk_live_…"
                  autoComplete="off"
                  value={stripeKey}
                  onChange={(e) => setStripeKey(e.target.value)}
                />
                <span className="input-label" style={{ fontSize: '0.8rem' }}>
                  In Stripe, open Developers → API keys → Create restricted key, and give it Read access to Balance only.
                  The key is stored encrypted and is only used to read balance transactions.
                </span>
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={Boolean(busy) || !stripeKey.trim()}>
                {busy === 'stripe-connect' ? 'Connecting…' : 'Connect Stripe'}
              </button>
            </form>
          )}
          <Message message={stripeMessage} />
        </div>

        {/* Custom Web / PC */}
        <div className="glass-panel">
          <div className="flex-between">
            <div className="flex-center gap-4">
              <AppWindow size={32} color="#ff2e93" />
              <div>
                <h3>Custom API (Web/PC)</h3>
                <p className="input-label" style={{ fontSize: '0.8rem' }}>{customConnected ? `Key ${activeKey.key_prefix}…` : 'Custom Software Data'}</p>
              </div>
            </div>
            {customConnected && <CheckCircle2 color="#ff2e93" aria-label="Connected" />}
          </div>
          <p className="mt-4 input-label">Send daily revenue, downloads, purchases and active users from any app or script with one HTTP request.</p>

          {newKey && (
            <div className="mt-4">
              <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Copy your key now. It won't be shown again.</p>
              <div className="flex-center gap-4" style={{ marginTop: '8px' }}>
                <code style={{ flex: 1, overflowWrap: 'anywhere', fontSize: '0.8rem', padding: '8px', background: 'rgba(0,0,0,0.04)', borderRadius: '8px' }}>{newKey}</code>
                <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => copy(newKey)} aria-label="Copy API key"><Copy size={16} /></button>
              </div>
            </div>
          )}

          {customConnected && (
            <>
              <p className="input-label" style={{ fontSize: '0.8rem', marginTop: '8px' }}>
                Created {formatDateTime(activeKey.created_at)} · {activeKey.last_used_at ? `last used ${formatDateTime(activeKey.last_used_at)}` : 'not used yet'}
              </p>
              <details className="mt-4">
                <summary className="input-label" style={{ cursor: 'pointer' }}>Example request</summary>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.75rem', marginTop: '8px', padding: '12px', background: 'rgba(0,0,0,0.04)', borderRadius: '8px' }}>
                  {exampleRequest(newKey || 'YOUR_API_KEY')}
                </pre>
                <p className="input-label" style={{ fontSize: '0.8rem' }}>
                  Send up to 366 days per request. Each day replaces what this API sent before for that day.
                </p>
              </details>
            </>
          )}

          <div className="flex-center gap-4 mt-4">
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleGenerateKey} disabled={Boolean(busy)}>
              {busy === 'key' ? 'Creating…' : customConnected ? 'Replace API Key' : 'Generate API Key'}
            </button>
            {customConnected && (
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleRevokeKey} disabled={Boolean(busy)}>
                {busy === 'revoke' ? 'Revoking…' : 'Revoke API Key'}
              </button>
            )}
          </div>
          <Message message={customMessage} />
        </div>

        <ComingSoon
          icon={Play}
          color="#00f0ff"
          title="Google Play Console"
          subtitle="Android App Data"
          description="Import downloads, uninstalls, crash rates, and in-app purchases."
        />
        <ComingSoon
          icon={Apple}
          color="#111"
          title="Apple Developer"
          subtitle="iOS App Data"
          description="Sync App Store sales, subscription retention, and impressions."
        />

      </div>
    </div>
  );
}
