import React, { useState } from 'react';
import { Lightbulb, Plus } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useToast } from '../ui/toast-context';
import { friendlyError, supabase } from '../../lib/supabase';
import { engine } from '../../lib/engine';
import { useChartPalette } from '../../context/preset';
import Notice from '../ui/Notice';

const EMPTY = { title: '', body: '', kind: 'ai', pattern: '', paths: '', severity: 'medium' };
const KINDS = { ai: 'Written rule (checked by your Engine AI)', forbid_pattern: 'Must never match a pattern', require_pattern: 'Every matching file must contain a pattern' };

function RuleForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('Give the rule a title.');
    if (form.kind !== 'ai') {
      try {
        new RegExp(form.pattern);
      } catch {
        return setError('The pattern isn\'t a valid regular expression.');
      }
      if (!form.pattern.trim()) return setError('Add the pattern to look for.');
    } else if (!form.body.trim()) return setError('Say what the code must or must not do.');
    setError('');
    onSave({
      title: form.title.trim().slice(0, 120), body: form.body.trim().slice(0, 1000), kind: form.kind,
      pattern: form.kind === 'ai' ? null : form.pattern.trim().slice(0, 300),
      paths: form.paths.split(',').map((p) => p.trim()).filter(Boolean).slice(0, 10), severity: form.severity,
    });
  };
  return (
    <form className="card card--raised rule-form" onSubmit={submit} noValidate>
      <div className="grid-2">
        <div className="field">
          <label className="field-label" htmlFor="rule-title">Title</label>
          <input id="rule-title" className="input-field" maxLength={120} value={form.title} onChange={set('title')} placeholder="Database access goes through lib/db" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rule-kind">Kind</label>
          <select id="rule-kind" className="input-field" value={form.kind} onChange={set('kind')}>
            {Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="rule-body">{form.kind === 'ai' ? 'What must (or must not) happen' : 'Why (shown with violations)'}</label>
        <textarea id="rule-body" className="input-field" rows={2} maxLength={1000} value={form.body} onChange={set('body')} placeholder="Components never call Supabase directly; they use the functions in src/lib." />
      </div>
      <div className="grid-3">
        {form.kind !== 'ai' && (
          <div className="field">
            <label className="field-label" htmlFor="rule-pattern">Pattern (regular expression)</label>
            <input id="rule-pattern" className="input-field" maxLength={300} value={form.pattern} onChange={set('pattern')} placeholder="console\.log\(" spellCheck="false" />
          </div>
        )}
        <div className="field">
          <label className="field-label" htmlFor="rule-paths">Applies to (globs, comma separated)</label>
          <input id="rule-paths" className="input-field" value={form.paths} onChange={set('paths')} placeholder="src/components/**/*.jsx" spellCheck="false" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rule-severity">Severity</label>
          <select id="rule-severity" className="input-field" value={form.severity} onChange={set('severity')}>
            {['critical', 'high', 'medium', 'low', 'info'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="page-actions" style={{ marginTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>{saving ? 'Saving…' : 'Save rule'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

// Context & Drift: the architecture rules for this repo, suggestions from its notes, and how
// far the code has drifted from them over time
export default function RulesEditor({ repo, rules, driftRuns, onChanged }) {
  const toast = useToast();
  const { series: SERIES_COLORS, chrome: CHART_CHROME } = useChartPalette();
  const [editing, setEditing] = useState(null); // 'new' | rule id | null
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const save = async (values) => {
    setSaving(true);
    const query = editing === 'new'
      ? supabase.from('engine_context_rules').insert({ ...values, repo_id: repo.id })
      : supabase.from('engine_context_rules').update(values).eq('id', editing);
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) return toast.show({ message: friendlyError(saveError, 'Could not save the rule. Try again; your text is still in the form.'), tone: 'error' });
    setEditing(null);
    onChanged();
  };

  const toggle = async (rule) => {
    const { error: toggleError } = await supabase.from('engine_context_rules').update({ enabled: !rule.enabled }).eq('id', rule.id);
    if (toggleError) toast.show({ message: friendlyError(toggleError, 'Could not change the rule.'), tone: 'error' });
    onChanged();
  };

  const remove = async (rule) => {
    const { error: removeError } = await supabase.from('engine_context_rules').delete().eq('id', rule.id);
    if (removeError) return toast.show({ message: friendlyError(removeError, 'Could not delete the rule.'), tone: 'error' });
    onChanged();
    toast.show({
      message: `Deleted “${rule.title}”.`,
      actionLabel: 'Undo',
      onAction: async () => {
        const { id: _id, created_at: _c, updated_at: _u, ...restore } = rule;
        await supabase.from('engine_context_rules').insert(restore);
        onChanged();
      },
    });
  };

  const suggest = async () => {
    setBusy('suggest');
    setError('');
    const result = await engine('rules_suggest', { repo_id: repo.id });
    setBusy('');
    if (result.error) return setError(result.error);
    setSuggestions(result.rules.map((r) => ({ ...r, from: result.from })));
  };

  const accept = async (rule) => {
    const { error: addError } = await supabase.from('engine_context_rules').insert({
      repo_id: repo.id, title: rule.title.slice(0, 120), body: rule.body.slice(0, 1000), kind: 'ai', paths: rule.paths.slice(0, 10), severity: rule.severity,
    });
    if (addError) return toast.show({ message: friendlyError(addError, 'Could not add the rule.'), tone: 'error' });
    setSuggestions((list) => list.filter((r) => r !== rule));
    onChanged();
  };

  const chart = driftRuns.filter((r) => r.status === 'succeeded' && r.stats?.drift_score !== undefined).slice(0, 20).reverse()
    .map((r) => ({ label: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), drift: r.stats.drift_score }));

  return (
    <section className="section" aria-labelledby="rules-title">
      <div className="section-header">
        <h2 id="rules-title">Context & Drift rules</h2>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={suggest} disabled={Boolean(busy)} aria-busy={busy === 'suggest'}>
            <Lightbulb aria-hidden="true" /> {busy === 'suggest' ? 'Reading your notes…' : 'Suggest from CLAUDE.md'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')} disabled={editing !== null}><Plus aria-hidden="true" /> Add rule</button>
        </div>
      </div>
      {error && <div style={{ marginBottom: 10 }}><Notice tone="error">{error}</Notice></div>}
      {editing === 'new' && <RuleForm initial={EMPTY} onSave={save} onCancel={() => setEditing(null)} saving={saving} />}

      {suggestions && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="field-help">Drafted by your Engine AI from {suggestions[0]?.from?.join(', ') ?? 'your notes'}. Add the ones that are right.</p>
          {suggestions.length === 0 ? <p className="muted">No more suggestions.</p> : (
            <ul className="suggestion-list">
              {suggestions.map((r, i) => (
                <li key={i}>
                  <div><strong>{r.title}</strong><p className="field-help">{r.body}{r.paths.length ? ` · ${r.paths.join(', ')}` : ''}</p></div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => accept(r)}>Add</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSuggestions(null)}>Close</button>
        </div>
      )}

      {rules.length === 0 && editing !== 'new' ? (
        <div className="card empty-state"><p>No rules yet. Write down how this codebase should stay organised, or let your Engine AI suggest rules from your CLAUDE.md, AGENTS.md or .cursorrules.</p></div>
      ) : (
        <ul className="card card--flush rule-list">
          {rules.map((rule) => (
            editing === rule.id ? (
              <li key={rule.id} style={{ padding: 12 }}>
                <RuleForm initial={{ ...rule, pattern: rule.pattern ?? '', paths: rule.paths.join(', ') }} onSave={save} onCancel={() => setEditing(null)} saving={saving} />
              </li>
            ) : (
              <li key={rule.id} className={rule.enabled ? '' : 'is-off'}>
                <div>
                  <strong>{rule.title}</strong> <span className="badge">{rule.severity}</span>
                  <p className="field-help">{rule.kind === 'ai' ? rule.body : `${rule.kind === 'forbid_pattern' ? 'Never' : 'Always'} /${rule.pattern}/`}{rule.paths.length ? ` · ${rule.paths.join(', ')}` : ' · everywhere'}</p>
                </div>
                <div className="page-actions">
                  <label className="check-row" style={{ padding: 0 }}><input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule)} /> On</label>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(rule.id)} disabled={editing !== null}>Edit</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(rule)}>Delete<span className="visually-hidden"> {rule.title}</span></button>
                </div>
              </li>
            )
          ))}
        </ul>
      )}

      {chart.length > 1 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 className="card-title">Drift over time</h3>
          <p className="field-help">Share of checked rules broken at each Context & Drift run. Lower is better.</p>
          <div style={{ height: 180 }} role="img" aria-label={`Drift went from ${chart[0].drift}% to ${chart.at(-1).drift}% over ${chart.length} runs.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} />
                <XAxis dataKey="label" tick={{ fill: CHART_CHROME.axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: CHART_CHROME.baseline }} />
                <YAxis domain={[0, 100]} tick={{ fill: CHART_CHROME.axis, fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={44} />
                <Tooltip formatter={(v) => [`${v}%`, 'Drift']} />
                <Line type="monotone" dataKey="drift" stroke={SERIES_COLORS.revenue} strokeWidth={2} dot={{ r: 4, fill: SERIES_COLORS.revenue, stroke: CHART_CHROME.surface, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
