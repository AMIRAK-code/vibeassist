import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { friendlyError, supabase } from '../lib/supabase';
import { CURRENCIES, EXPERIENCE_OPTIONS, GOALS, PROFIT_OPTIONS } from '../lib/options';
import { METRIC_COLUMNS } from '../lib/metrics';
import { downloadCsv } from '../lib/csv';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';

const FIELDS = ['name', 'experience', 'profit_expectancy', 'goals', 'currency'];
const FIELD_NAMES = { name: 'name', experience: 'experience', profit_expectancy: 'monthly profit target', goals: 'goals', currency: 'currency' };
const pick = (p) => ({
  name: p?.name ?? '',
  experience: p?.experience ?? 'Beginner',
  profit_expectancy: p?.profit_expectancy ?? '$0 - $1,000',
  goals: p?.goals ?? [],
  currency: p?.currency ?? 'USD',
});
const differing = (a, b) => FIELDS.filter((f) => JSON.stringify(a[f] ?? '') !== JSON.stringify(b[f] ?? ''));
const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const planLabel = { monthly: 'monthly', yearly: 'yearly', promo: 'two-month trial' };

export default function Settings() {
  const { user, profile, subscription, hasPremium, refreshAccount, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => pick(profile));
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error | conflict
  const [errorText, setErrorText] = useState('');
  const [changedElsewhere, setChangedElsewhere] = useState([]);
  const [busy, setBusy] = useState('');
  const base = useRef({ values: pick(profile), version: profile?.updated_at });
  const queue = useRef(Promise.resolve());
  const nameTimer = useRef(null);
  const pending = useRef(null); // a name edit waiting out the typing pause
  const saveRef = useRef(null);

  // Saves are queued so each one starts from the version the previous one produced. If the row
  // changed elsewhere, only a change to these same fields counts as a conflict; anything else
  // (such as a launch checklist tick) is merged automatically.
  const save = (values) => {
    setStatus('saving');
    queue.current = queue.current.then(async () => {
      setStatus('saving');
      const payload = { ...values, name: values.name.trim() || null };
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase.from('profiles').update(payload).eq('id', user.id).eq('updated_at', base.current.version).select();
        if (error) {
          setErrorText(friendlyError(error, 'Check your connection and try again.'));
          setStatus('error');
          return;
        }
        if (data.length) {
          base.current = { values: pick(data[0]), version: data[0].updated_at };
          setStatus('saved');
          refreshAccount();
          return;
        }
        const { data: latest } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        const changed = latest ? differing(pick(latest), base.current.values) : FIELDS;
        if (changed.length) {
          setChangedElsewhere(changed.map((field) => FIELD_NAMES[field]));
          setStatus('conflict');
          return;
        }
        base.current.version = latest.updated_at; // only other fields changed: retry on top of it
      }
      setStatus('conflict');
    });
  };

  // Sends a waiting name edit now: after the typing pause, when the field loses focus,
  // or when leaving the page, so a quick edit is never dropped
  const flush = () => {
    clearTimeout(nameTimer.current);
    if (!pending.current) return;
    const values = pending.current;
    pending.current = null;
    save(values);
  };

  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => () => {
    clearTimeout(nameTimer.current);
    if (pending.current) saveRef.current(pending.current);
  }, []);

  const update = (patch, { debounce = false } = {}) => {
    const next = { ...form, ...patch };
    setForm(next);
    clearTimeout(nameTimer.current);
    pending.current = null;
    if (debounce) {
      pending.current = next;
      setStatus('saving');
      nameTimer.current = setTimeout(flush, 700);
    } else {
      save(next);
    }
  };

  const loadLatest = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!data) return;
    base.current = { values: pick(data), version: data.updated_at };
    setForm(pick(data));
    setStatus('idle');
    refreshAccount();
  };

  const toggleGoal = (goal) =>
    update({ goals: form.goals.includes(goal) ? form.goals.filter((g) => g !== goal) : [...form.goals, goal] });

  const switchPlan = async (plan, cycle) => {
    const previous = subscription;
    setBusy('plan');
    const { error } = await supabase.rpc('choose_plan', { p_plan: plan, p_billing_cycle: cycle });
    setBusy('');
    if (error) {
      toast.show({ message: friendlyError(error, 'Could not change your plan. Try again.'), tone: 'error' });
      return;
    }
    await refreshAccount();
    if (plan === 'free') {
      toast.show({
        message: 'Switched to Free. Your data, plans and campaigns are kept.',
        actionLabel: 'Undo',
        onAction: () => switchPlan('premium', previous?.billing_cycle ?? 'monthly'),
      });
    } else {
      toast.show({ message: 'Premium is back on.' });
    }
  };

  const sendReset = async () => {
    setBusy('reset');
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy('');
    if (error) toast.show({ message: friendlyError(error, 'Could not send the email. Try again in a minute.'), tone: 'error' });
    else toast.show({ message: `Sent a password reset link to ${user.email}.` });
  };

  const exportAll = async () => {
    setBusy('export');
    const { data, error } = await supabase.from('daily_metrics').select(METRIC_COLUMNS).order('day').range(0, 19999);
    setBusy('');
    if (error) {
      toast.show({ message: friendlyError(error, 'Could not export. Try again.'), tone: 'error' });
      return;
    }
    downloadCsv('vibeassist-all-numbers.csv', [
      { key: 'day', label: 'Day' }, { key: 'source', label: 'Source' }, { key: 'revenue', label: `Revenue (${form.currency})` },
      { key: 'fees', label: 'Payment fees' }, { key: 'ad_spend', label: 'Ad spend' }, { key: 'organic_downloads', label: 'Organic downloads' },
      { key: 'paid_downloads', label: 'Downloads from ads' }, { key: 'purchases', label: 'Purchases' }, { key: 'active_users', label: 'Active users' },
    ], data);
    toast.show({ message: `Exported ${data.length} rows.` });
  };

  return (
    <>
      <PageHeader title="Settings" description="Your profile, plan and account." />

      <section className="card" aria-labelledby="profile-title">
        <div className="section-header">
          <div>
            <h2 id="profile-title" className="card-title">Profile</h2>
            <p className="card-subtitle">Claude uses these to tailor your weekly plan. Changes save automatically.</p>
          </div>
          <span className={`save-status${status === 'error' || status === 'conflict' ? ' save-status--error' : ''}`} role="status" aria-live="polite">
            {status === 'saving' && <><span className="spinner" /> Saving…</>}
            {status === 'saved' && 'All changes saved'}
            {status === 'error' && 'Not saved'}
            {status === 'conflict' && 'Changed elsewhere'}
          </span>
        </div>

        {status === 'error' && (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => save(form)}>Retry</button>}>
              Your last change wasn't saved. {errorText}
            </Notice>
          </div>
        )}
        {status === 'conflict' && (
          <div style={{ marginBottom: 14 }}>
            <Notice
              tone="warning"
              actions={<>
                <button type="button" className="btn btn-secondary btn-sm" onClick={loadLatest}>Load the latest version</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                  const { data } = await supabase.from('profiles').select('updated_at').eq('id', user.id).single();
                  if (data) base.current.version = data.updated_at;
                  save(form);
                }}>Keep mine</button>
              </>}
            >
              Your {listOf(changedElsewhere) || 'profile'} changed in another tab or device while you were editing here. Load the latest version, or keep what's on this screen.
            </Notice>
          </div>
        )}

        <div className="grid-2">
          <div className="field">
            <label className="field-label" htmlFor="settings-name">Name</label>
            <input id="settings-name" className="input-field" maxLength={80} autoComplete="name" value={form.name} onChange={(e) => update({ name: e.target.value }, { debounce: true })} onBlur={flush} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="settings-currency">Currency</label>
            <select id="settings-currency" className="input-field" value={form.currency} onChange={(e) => update({ currency: e.target.value })}>
              {[...new Set([form.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
            </select>
            <span className="field-help">Labels amounts; it doesn't convert them. Connecting Stripe sets it to your Stripe currency.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="settings-experience">Experience</label>
            <select id="settings-experience" className="input-field" value={form.experience} onChange={(e) => update({ experience: e.target.value })}>
              {EXPERIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="settings-target">Monthly profit target</label>
            <select id="settings-target" className="input-field" value={form.profit_expectancy} onChange={(e) => update({ profit_expectancy: e.target.value })}>
              {PROFIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <fieldset className="field" style={{ border: 0 }}>
          <legend className="field-label" style={{ marginBottom: 4 }}>Goals</legend>
          <div className="goal-grid">
            {GOALS.map((goal) => (
              <label key={goal} className="check-row">
                <input type="checkbox" checked={form.goals.includes(goal)} onChange={() => toggleGoal(goal)} />
                {goal}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card section" aria-labelledby="plan-title">
        <h2 id="plan-title" className="card-title">Plan</h2>
        {hasPremium ? (
          <p style={{ marginTop: 6 }}>
            Premium ({planLabel[subscription?.billing_cycle] ?? 'demo'})
            {subscription?.current_period_end && ` until ${new Date(subscription.current_period_end).toLocaleDateString()}`}.
          </p>
        ) : (
          <p style={{ marginTop: 6 }}>Free: overview, manual entry, launch guides and news.</p>
        )}
        <p className="field-help">Checkout is in demo mode: changing plans never charges you.</p>
        <div className="page-actions" style={{ marginTop: 12 }}>
          {hasPremium ? (
            <button type="button" className="btn btn-secondary" onClick={() => switchPlan('free', null)} disabled={busy === 'plan'}>{busy === 'plan' ? 'Switching…' : 'Switch to Free'}</button>
          ) : (
            <Link to="/premium?from=/settings" className="btn btn-secondary">See Premium plans</Link>
          )}
        </div>
      </section>

      <section className="card section" aria-labelledby="account-title">
        <h2 id="account-title" className="card-title">Account</h2>
        <p style={{ marginTop: 6 }}>Signed in as <strong>{user?.email}</strong></p>
        <div className="page-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={sendReset} disabled={busy === 'reset'}>{busy === 'reset' ? 'Sending…' : 'Email me a password reset link'}</button>
          <button type="button" className="btn btn-ghost" onClick={async () => { await signOut(); navigate('/', { replace: true }); }}>Sign out</button>
        </div>
      </section>

      <section className="card section" aria-labelledby="data-title">
        <h2 id="data-title" className="card-title">Your data</h2>
        <p className="card-subtitle">Every daily number from every source, as a spreadsheet-friendly CSV.</p>
        <div className="page-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={exportAll} disabled={busy === 'export'}><Download aria-hidden="true" /> {busy === 'export' ? 'Preparing…' : 'Download all numbers'}</button>
        </div>
      </section>
    </>
  );
}
