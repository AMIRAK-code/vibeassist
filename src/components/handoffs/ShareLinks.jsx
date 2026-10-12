import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Link2 } from 'lucide-react';
import { useToast } from '../ui/toast-context';
import { friendlyError, supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/format';
import Notice from '../ui/Notice';

const DAYS = [
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
];

const linkStatus = (link) => {
  if (link.revoked_at) return { label: 'Revoked', tone: '' };
  if (new Date(link.expires_at) <= new Date()) return { label: 'Expired', tone: '' };
  return { label: `Works until ${formatDateTime(link.expires_at)}`, tone: 'badge--success', active: true };
};

// Read-only links to one handoff. Only a hash of each link is stored, so a new link is shown
// once, right after it's made.
export default function ShareLinks({ handoff, hasPremium }) {
  const toast = useToast();
  const [links, setLinks] = useState(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('handoff_links')
      .select('id, expires_at, revoked_at, views, last_viewed_at, created_at')
      .eq('handoff_id', handoff.id).order('created_at', { ascending: false });
    if (loadError) setError(friendlyError(loadError, 'Could not load the share links.'));
    setLinks(data ?? []);
  }, [handoff.id]);

  useEffect(() => {
    if (hasPremium) load();
  }, [hasPremium, load]);

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ message: 'Link copied.' });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser. Select the link and copy it.', tone: 'error' });
    }
  };

  const create = async () => {
    setBusy(true);
    setError('');
    const { data, error: createError } = await supabase.rpc('create_handoff_link', { p_handoff: handoff.id, p_days: days });
    setBusy(false);
    if (createError) {
      setError(friendlyError(createError, 'Could not make a link. Try again.'));
      return;
    }
    const url = `${window.location.origin}/handoff#${data.token}`;
    setFresh({ url, expiresAt: data.expires_at });
    copy(url);
    load();
  };

  const revoke = async (link) => {
    const { error: revokeError } = await supabase.rpc('revoke_handoff_link', { p_link: link.id });
    if (revokeError) {
      toast.show({ message: friendlyError(revokeError, 'Could not revoke the link. Try again.'), tone: 'error' });
      return;
    }
    toast.show({ message: 'Link revoked. It no longer opens the handoff.' });
    load();
  };

  if (!hasPremium) {
    return (
      <section className="handoff-share" aria-label="Share">
        <h4><Link2 aria-hidden="true" /> Share</h4>
        <p className="field-help">
          Share links let another account, device or teammate read this handoff for up to 30 days.
          {' '}<Link to="/premium?from=/handoffs">They're part of Premium.</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="handoff-share" aria-labelledby={`share-${handoff.id}`}>
      <h4 id={`share-${handoff.id}`}><Link2 aria-hidden="true" /> Share</h4>
      <p className="field-help">Anyone with the link can read this handoff until it expires. They can't change it or see who shared it.</p>
      <div className="page-actions" style={{ marginTop: 8 }}>
        <label className="field-help" htmlFor={`share-days-${handoff.id}`}>Link lasts</label>
        <select id={`share-days-${handoff.id}`} className="input-field handoff-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={create} disabled={busy} aria-busy={busy}>
          {busy ? <><span className="spinner" /> Making…</> : 'Make a link'}
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {fresh && (
        <div className="handoff-link">
          <input className="input-field" readOnly value={fresh.url} aria-label="New share link" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(fresh.url)}><Copy aria-hidden="true" /> Copy</button>
          <p className="field-help">Copy it now: for safety it's only shown this once. It works until {formatDateTime(fresh.expiresAt)}.</p>
        </div>
      )}
      {links?.length > 0 && (
        <ul className="handoff-links" aria-label="Links to this handoff">
          {links.map((link) => {
            const status = linkStatus(link);
            return (
              <li key={link.id}>
                <span className={`badge ${status.tone}`}>{status.label}</span>
                <span className="field-help">
                  Made {formatDateTime(link.created_at)} · {link.views} {link.views === 1 ? 'view' : 'views'}
                  {link.last_viewed_at ? `, last ${formatDateTime(link.last_viewed_at)}` : ''}
                </span>
                {status.active && <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(link)}>Revoke</button>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
