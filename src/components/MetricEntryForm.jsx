import React, { useEffect, useRef, useState } from 'react';
import { friendlyError, supabase } from '../lib/supabase';
import { formatDay, isoDay } from '../lib/metrics';
import Notice from './ui/Notice';

const FIELDS = [
  { key: 'revenue', label: 'Revenue', step: '0.01', allowNegative: true, money: true, help: 'Negative on days refunds outweigh sales' },
  { key: 'ad_spend', label: 'Ad spend', step: '0.01', money: true },
  { key: 'organic_downloads', label: 'Organic downloads', step: '1' },
  { key: 'paid_downloads', label: 'Downloads from ads', step: '1' },
  { key: 'purchases', label: 'Purchases', step: '1', help: 'Used for conversion rate' },
  { key: 'active_users', label: 'Active users', step: '1', optional: true, help: 'Optional' },
];

const emptyValues = () => Object.fromEntries(FIELDS.map((f) => [f.key, '']));
const valuesFrom = (row) => Object.fromEntries(FIELDS.map((f) => [f.key, row[f.key] === null || row[f.key] === undefined ? '' : String(row[f.key])]));

// Adds or edits one day of hand-entered numbers (source 'manual'). Choosing a day that already
// has an entry loads it for editing, and a save never overwrites a newer version silently.
export default function MetricEntryForm({ userId, currency, entries, initialDay, onSaved, onCancel, onReload }) {
  const [today] = useState(() => isoDay(new Date()));
  const [day, setDay] = useState(initialDay ?? today);
  const existing = entries[day];
  const [values, setValues] = useState(() => (existing ? valuesFrom(existing) : emptyValues()));
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState({});
  const [saving, setSaving] = useState(false);
  const firstField = useRef(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  const changeDay = (next) => {
    setDay(next);
    setError(null);
    setFieldError({});
    // Load what is already saved for that day so it is edited, not replaced by accident
    setValues(entries[next] ? valuesFrom(entries[next]) : emptyValues());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const row = { user_id: userId, day, source: 'manual' };
    const errors = {};
    for (const field of FIELDS) {
      const raw = values[field.key].trim();
      if (raw === '') {
        row[field.key] = field.optional ? null : 0;
        continue;
      }
      const number = Number(raw);
      if (!Number.isFinite(number)) errors[field.key] = 'Enter a number.';
      else if (!field.allowNegative && number < 0) errors[field.key] = 'Use zero or more.';
      else row[field.key] = field.step === '1' ? Math.round(number) : Math.round(number * 100) / 100;
    }
    setFieldError(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setError(null);
    const query = existing
      ? supabase.from('daily_metrics').update(row).eq('day', day).eq('source', 'manual').eq('updated_at', existing.updated_at)
      : supabase.from('daily_metrics').insert(row);
    const { data, error: saveError } = await query.select();
    setSaving(false);

    if (saveError?.code === '23505') {
      setError({ conflict: true, text: `Numbers for ${formatDay(day)} were added in another tab or device. Load them to edit instead.` });
      return;
    }
    if (saveError) {
      setError({ text: friendlyError(saveError, 'Could not save. Check your connection and try again; your numbers are still here.') });
      return;
    }
    if (!data?.length) {
      setError({ conflict: true, text: `Your entry for ${formatDay(day)} changed in another tab or device since you opened it. Load the latest version; what you typed is still here.` });
      return;
    }
    onSaved(data[0], Boolean(existing));
  };

  return (
    <form className="card card--raised" onSubmit={handleSubmit} aria-labelledby="entry-title" noValidate>
      <div className="section-header" style={{ marginBottom: 14 }}>
        <div>
          <h2 id="entry-title" className="card-title">{existing ? `Edit ${formatDay(day)}` : 'Add a day'}</h2>
          <p className="card-subtitle">
            {existing ? 'You entered numbers for this day before. Saving updates them.' : `Totals for one day, in ${currency}. Leave a field empty for zero.`}
          </p>
        </div>
      </div>

      <div className="grid-4">
        <div className="field">
          <label className="field-label" htmlFor="metric-day">Day</label>
          <input
            id="metric-day"
            ref={firstField}
            type="date"
            className="input-field"
            required
            max={today}
            value={day}
            onChange={(e) => e.target.value && changeDay(e.target.value)}
          />
        </div>
        {FIELDS.map((field) => (
          <div className="field" key={field.key}>
            <label className="field-label" htmlFor={`metric-${field.key}`}>{field.label}{field.money ? ` (${currency})` : ''}</label>
            <input
              id={`metric-${field.key}`}
              type="number"
              inputMode={field.step === '1' ? 'numeric' : 'decimal'}
              step={field.step}
              min={field.allowNegative ? undefined : 0}
              className="input-field"
              placeholder={field.optional ? '' : '0'}
              aria-invalid={Boolean(fieldError[field.key])}
              aria-describedby={fieldError[field.key] || field.help ? `metric-${field.key}-help` : undefined}
              value={values[field.key]}
              onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
            />
            {(fieldError[field.key] || field.help) && (
              <span id={`metric-${field.key}-help`} className={fieldError[field.key] ? 'field-error' : 'field-help'}>
                {fieldError[field.key] ?? field.help}
              </span>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 14 }}>
          <Notice
            tone="error"
            actions={error.conflict && onReload ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={async () => {
                const fresh = await onReload(day);
                if (fresh) {
                  setValues(valuesFrom(fresh));
                  setError(null);
                }
              }}>Load latest</button>
            ) : null}
          >
            {error.text}
          </Notice>
        </div>
      )}

      <div className="page-actions">
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
          {saving ? <><span className="spinner spinner--light" /> Saving…</> : existing ? 'Save changes' : 'Save day'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
