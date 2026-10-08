import React, { useState } from 'react';
import { Apple, Play, RefreshCw, Upload } from 'lucide-react';
import { useToast } from './ui/toast-context';
import { callFunction } from '../lib/supabase';
import { formatDateTime } from '../lib/format';
import { formatDay } from '../lib/metrics';
import { describeSync, readKeyFile } from '../lib/integrations';
import Notice from './ui/Notice';
import ConfirmButton from './ui/ConfirmButton';

const STORES = {
  app_store: {
    title: 'Apple App Store Connect',
    short: 'App Store',
    icon: Apple,
    subtitle: 'Daily downloads, in-app purchases and proceeds from Sales and Trends, for the last 90 days.',
    empty: { issuerId: '', keyId: '', vendorNumber: '', privateKey: '' },
    fileLabel: 'Private key (.p8)',
    fileAccept: '.p8,application/x-pem-file,text/plain',
    fileField: 'privateKey',
  },
  google_play: {
    title: 'Google Play Console',
    short: 'Google Play',
    icon: Play,
    subtitle: 'Daily installs and in-app purchase revenue from the reports Play Console keeps for you.',
    empty: { serviceAccount: '', bucket: '', packages: '', feeRate: '0.15' },
    fileLabel: 'Service account key (.json)',
    fileAccept: '.json,application/json',
    fileField: 'serviceAccount',
  },
};

export default function StoreCard({ provider, integration, onChanged }) {
  const toast = useToast();
  const store = STORES[provider];
  const Icon = store.icon;
  const [form, setForm] = useState(store.empty);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const connected = integration?.status === 'connected';
  const settings = integration?.settings ?? {};
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same file can be picked again after an error
    if (!file) return;
    try {
      const text = await readKeyFile(file);
      setForm((f) => ({ ...f, [store.fileField]: text }));
      setFileName(file.name);
      setError('');
    } catch (readError) {
      setError(readError.message);
    }
  };

  const act = async (action) => {
    if (busy) return;
    setBusy(action);
    setError('');
    const { data, status } = await callFunction('store-sync', { provider, action, ...(action === 'connect' ? { credentials: form } : {}) });
    setBusy('');
    if (status !== 200) {
      setError(data?.error ?? `${store.title} request failed. Try again.`);
      await onChanged();
      return;
    }
    if (action === 'disconnect') {
      toast.show({ message: `${store.title} disconnected. Days already imported stay on Overall Income.` });
    } else {
      if (action === 'connect') {
        // The key is now encrypted on the server; drop the copy in this page
        setForm(store.empty);
        setFileName('');
      }
      toast.show({ message: `${store.short}: ${describeSync(provider, data)}.`, tone: data.partial ? 'error' : undefined });
    }
    await onChanged();
  };

  const canConnect = provider === 'app_store'
    ? form.issuerId.trim() && form.keyId.trim() && form.vendorNumber.trim() && form.privateKey
    : form.serviceAccount && form.bucket.trim();

  return (
    <section className="card" aria-labelledby={`${provider}-title`}>
      <div className="source-head">
        <Icon aria-hidden="true" />
        <div>
          <h2 id={`${provider}-title`} className="card-title">{store.title}</h2>
          <p className="card-subtitle">{store.subtitle}</p>
        </div>
        {integration !== undefined && (
          <span className={`badge ${connected ? 'badge--success' : integration?.status === 'error' ? 'badge--danger' : ''}`}>
            {connected ? `Connected · ${integration.account_label}` : integration?.status === 'error' ? 'Needs attention' : 'Not connected'}
          </span>
        )}
      </div>

      {connected ? (
        <>
          <p className="field-help" style={{ marginTop: 12 }}>
            Last synced {integration.last_synced_at ? formatDateTime(integration.last_synced_at) : 'never'}
            {settings.synced_through && ` · complete up to ${formatDay(settings.synced_through, true)}`}
            {provider === 'google_play' && settings.packages?.length ? ` · ${settings.packages.join(', ')}` : ''}.
            {provider === 'app_store'
              ? ' Apple publishes each day\'s report the next day, so yesterday may still be missing.'
              : ' Play updates its reports a few times a day, usually a day or two behind.'}
          </p>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => act('sync')} disabled={Boolean(busy)} aria-busy={busy === 'sync'}>
              {busy === 'sync' ? <><span className="spinner spinner--light" /> Syncing…</> : <><RefreshCw aria-hidden="true" /> Sync now</>}
            </button>
            <ConfirmButton
              label="Disconnect"
              question={`Disconnect ${store.short}? You'll need to upload the key again to reconnect.`}
              busyLabel="Disconnecting…"
              busy={busy === 'disconnect'}
              disabled={Boolean(busy)}
              onConfirm={() => act('disconnect')}
            />
          </div>
          {error && <div style={{ marginTop: 12 }}><Notice tone="error">{error}</Notice></div>}
        </>
      ) : (
        <form style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); act('connect'); }}>
          {integration?.status === 'error' && <div style={{ marginBottom: 12 }}><Notice tone="error">{integration.last_error} Upload a working key to reconnect.</Notice></div>}

          {provider === 'app_store' ? (
            <>
              <p className="field-help" style={{ marginBottom: 10 }}>
                In App Store Connect, open Users and Access → Integrations → App Store Connect API → Team Keys, and create a key with the Sales role.
                Download its .p8 file (Apple only lets you download it once). The vendor number is under Payments and Financial Reports.
              </p>
              <div className="grid-3">
                <div className="field">
                  <label className="field-label" htmlFor="as-issuer">Issuer ID</label>
                  <input id="as-issuer" className="input-field" autoComplete="off" spellCheck="false" value={form.issuerId} onChange={set('issuerId')} placeholder="69a6de70-…" />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="as-key-id">Key ID</label>
                  <input id="as-key-id" className="input-field" autoComplete="off" spellCheck="false" value={form.keyId} onChange={set('keyId')} placeholder="2X9R4HXF34" />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="as-vendor">Vendor number</label>
                  <input id="as-vendor" className="input-field" inputMode="numeric" autoComplete="off" value={form.vendorNumber} onChange={set('vendorNumber')} placeholder="85012345" />
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="field-help" style={{ marginBottom: 10 }}>
                In Google Cloud, create a service account and download a JSON key for it. In Play Console → Users and permissions, invite the service
                account's email with "View app information and download bulk reports" and "View financial data". Copy the Cloud Storage URI from
                Play Console → Download reports. New permissions can take up to a day to start working.
              </p>
              <div className="grid-3">
                <div className="field">
                  <label className="field-label" htmlFor="gp-bucket">Cloud Storage URI</label>
                  <input id="gp-bucket" className="input-field" autoComplete="off" spellCheck="false" value={form.bucket} onChange={set('bucket')} placeholder="gs://pubsite_prod_rev_…" />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="gp-packages">Apps (optional)</label>
                  <input id="gp-packages" className="input-field" autoComplete="off" spellCheck="false" value={form.packages} onChange={set('packages')} placeholder="com.example.app" aria-describedby="gp-packages-help" />
                  <span id="gp-packages-help" className="field-help">Leave empty to import every app in the account.</span>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="gp-fee">Google's service fee</label>
                  <select id="gp-fee" className="input-field" value={form.feeRate} onChange={set('feeRate')}>
                    <option value="0.15">15% (subscriptions, or the first $1M a year)</option>
                    <option value="0.3">30%</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="field">
            <span className="field-label">{store.fileLabel}</span>
            <div className="page-actions">
              <input type="file" id={`${provider}-key-file`} className="visually-hidden" accept={store.fileAccept} onChange={pickFile} />
              <label htmlFor={`${provider}-key-file`} className="btn btn-secondary btn-sm"><Upload aria-hidden="true" /> {fileName ? 'Choose another file' : 'Choose file'}</label>
              <span className="field-help">{fileName || 'No file chosen'}. It's sent once over HTTPS and stored encrypted; VibeAssist only reads reports with it.</span>
            </div>
          </div>

          {error && <div style={{ marginBottom: 12 }}><Notice tone="error">{error}</Notice></div>}
          <button type="submit" className="btn btn-primary" disabled={Boolean(busy) || !canConnect} aria-busy={busy === 'connect'}>
            {busy === 'connect' ? <><span className="spinner spinner--light" /> Connecting and importing…</> : `Connect ${store.short}`}
          </button>
          {busy === 'connect' && <span className="field-help" style={{ marginLeft: 10 }}>The first import reads 90 days and can take a minute.</span>}
        </form>
      )}
    </section>
  );
}
