import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Send } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from './ui/toast-context';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { formatDateTime } from '../lib/format';
import Notice from './ui/Notice';

const STATUS = {
  active: 'Subscribed',
  pending: 'Waiting for you to confirm',
  unsubscribed: 'Not subscribed',
  bounced: 'Paused: emails to this address bounced',
  complained: 'Paused: marked as spam',
};

// The Weekly Vibe section of Settings: see and change the subscription, and preview the
// email as it would look for you this week
export default function NewsletterSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const [row, setRow] = useState(undefined);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null); // { subject, html, owner, ready }
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: readError } = await supabase.from('newsletter_subscribers').select('status, include_numbers, confirmed_at').maybeSingle();
    if (readError) setError(friendlyError(readError, 'Could not load your email settings.'));
    setRow(data ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setNumbers = async (value) => {
    setRow((r) => ({ ...r, include_numbers: value }));
    const { error: saveError } = await supabase.from('newsletter_subscribers').update({ include_numbers: value }).eq('user_id', user.id);
    if (saveError) {
      setRow((r) => ({ ...r, include_numbers: !value }));
      toast.show({ message: friendlyError(saveError, 'Could not save that. Try again.'), tone: 'error' });
    }
  };

  const unsubscribe = async () => {
    setBusy('unsubscribe');
    const { error: rpcError } = await supabase.rpc('newsletter_unsubscribe');
    setBusy('');
    if (rpcError) {
      toast.show({ message: friendlyError(rpcError, 'Could not unsubscribe. Try again.'), tone: 'error' });
      return;
    }
    toast.show({ message: "Unsubscribed. You won't get the Weekly Vibe any more." });
    load();
  };

  const showPreview = async () => {
    setBusy('preview');
    setError('');
    const { data, status } = await callFunction('weekly-digest', { action: 'preview' });
    setBusy('');
    if (status !== 200) {
      setError(data?.error ?? 'Could not build the preview. Try again.');
      return;
    }
    setPreview(data);
  };

  const testSend = async () => {
    setBusy('test');
    const { data, status } = await callFunction('weekly-digest', { action: 'test_send' });
    setBusy('');
    if (status !== 200) toast.show({ message: data?.error === 'not_configured' ? 'Sending isn’t set up yet (Resend key and business details).' : data?.error ?? 'Test send failed.', tone: 'error' });
    else toast.show({ message: `Test email sent to ${data.to}.` });
  };

  return (
    <section className="card section" id="newsletter" aria-labelledby="newsletter-title">
      <h2 id="newsletter-title" className="card-title">Weekly Vibe email</h2>
      {row === undefined ? (
        <div className="skeleton" style={{ height: 40, marginTop: 8 }} aria-busy="true" aria-label="Loading" />
      ) : (
        <>
          <p style={{ marginTop: 6 }}>
            <strong>{STATUS[row?.status] ?? 'Not subscribed'}</strong>
            {row?.status === 'active' && row.confirmed_at && <span className="field-help"> · since {formatDateTime(row.confirmed_at)}</span>}
          </p>
          {row?.status === 'active' && (
            <label className="check-row">
              <input type="checkbox" checked={row.include_numbers} onChange={(e) => setNumbers(e.target.checked)} />
              <span>Include my own numbers for last week</span>
            </label>
          )}
          <div className="page-actions" style={{ marginTop: 10 }}>
            {row?.status === 'active' || row?.status === 'pending' ? (
              <button type="button" className="btn btn-ghost" onClick={unsubscribe} disabled={Boolean(busy)}>{busy === 'unsubscribe' ? 'Unsubscribing…' : 'Unsubscribe'}</button>
            ) : (
              <Link className="btn btn-secondary" to="/newsletter">Subscribe on News & Newsletter</Link>
            )}
            <button type="button" className="btn btn-ghost" onClick={showPreview} disabled={Boolean(busy)} aria-busy={busy === 'preview'}>
              <Eye aria-hidden="true" /> {busy === 'preview' ? 'Building…' : 'Preview this week’s email'}
            </button>
            {preview?.owner && (
              <button type="button" className="btn btn-ghost" onClick={testSend} disabled={Boolean(busy)} aria-busy={busy === 'test'}>
                <Send aria-hidden="true" /> {busy === 'test' ? 'Sending…' : 'Send me a test'}
              </button>
            )}
          </div>
        </>
      )}
      {error && <div style={{ marginTop: 12 }}><Notice tone="error">{error}</Notice></div>}
      {preview && (
        <div className="email-preview">
          <p className="field-help">Subject: <strong>{preview.subject}</strong>{!preview.ready && ' · sending isn’t set up yet, so this is only a preview'}</p>
          <iframe title="Weekly Vibe email preview" srcDoc={preview.html} sandbox="" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>Close preview</button>
        </div>
      )}
    </section>
  );
}
