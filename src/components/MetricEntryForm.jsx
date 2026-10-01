import React, { useState } from 'react';
import { friendlyError, supabase } from '../lib/supabase';
import { isoDay } from '../lib/metrics';

const FIELDS = [
  { key: 'revenue', label: 'Revenue', step: '0.01', allowNegative: true },
  { key: 'ad_spend', label: 'Ad spend', step: '0.01' },
  { key: 'organic_downloads', label: 'Organic downloads', step: '1' },
  { key: 'paid_downloads', label: 'Paid downloads', step: '1' },
  { key: 'purchases', label: 'Purchases', step: '1' },
  { key: 'active_users', label: 'Active users (optional)', step: '1', optional: true },
];

// Saves one day of hand-entered numbers (source 'manual'). Saving the same day again replaces it.
export default function MetricEntryForm({ userId, currency, onSaved, onCancel }) {
  const [today] = useState(() => isoDay(new Date()));
  const [day, setDay] = useState(today);
  const [values, setValues] = useState({ revenue: '', ad_spend: '', organic_downloads: '', paid_downloads: '', purchases: '', active_users: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const row = { user_id: userId, day, source: 'manual' };
    for (const field of FIELDS) {
      const raw = values[field.key].trim();
      if (raw === '') {
        row[field.key] = field.optional ? null : 0;
        continue;
      }
      const number = Number(raw);
      if (!Number.isFinite(number) || (!field.allowNegative && number < 0)) {
        setError(`${field.label} must be ${field.allowNegative ? 'a number' : 'zero or more'}.`);
        return;
      }
      row[field.key] = field.step === '1' ? Math.round(number) : number;
    }
    setSaving(true);
    setError('');
    const { error: saveError } = await supabase.from('daily_metrics').upsert(row, { onConflict: 'user_id,day,source' });
    setSaving(false);
    if (saveError) setError(friendlyError(saveError, 'Could not save this day. Try again.'));
    else onSaved(day);
  };

  return (
    <form className="glass-panel mt-4" onSubmit={handleSubmit}>
      <h3>Add or update a day</h3>
      <p className="input-label" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
        Amounts are in {currency}. Saving a day you already entered replaces those numbers.
      </p>
      <div className="grid-4 mt-4" style={{ gap: '16px' }}>
        <div className="input-group">
          <label className="input-label" htmlFor="metric-day">Date</label>
          <input id="metric-day" type="date" className="input-field" required max={today} value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        {FIELDS.map((field) => (
          <div className="input-group" key={field.key}>
            <label className="input-label" htmlFor={`metric-${field.key}`}>{field.label}</label>
            <input
              id={`metric-${field.key}`}
              type="number"
              inputMode="decimal"
              step={field.step}
              min={field.allowNegative ? undefined : 0}
              className="input-field"
              placeholder={field.optional ? '—' : '0'}
              value={values[field.key]}
              onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      {error && <p role="alert" style={{ color: '#d93025', fontSize: '0.9rem' }}>{error}</p>}
      <div className="flex-center gap-4" style={{ justifyContent: 'flex-start' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save day'}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
