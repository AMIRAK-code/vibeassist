import React, { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Upload } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from './ui/toast-context';
import { parseCsv, parseNumber } from '../lib/csv';
import { formatCount, formatMoneyExact } from '../lib/format';
import { download } from '../lib/download';
import { friendlyError, supabase } from '../lib/supabase';
import Notice from './ui/Notice';

const FIELDS = [
  { key: 'day', label: 'Date (YYYY-MM-DD)', required: true, synonyms: ['day', 'date', 'created', 'period', 'timestamp', 'begin date'] },
  { key: 'revenue', label: 'Revenue', synonyms: ['revenue', 'gross', 'proceeds', 'developer proceeds', 'sales', 'amount', 'net'] },
  { key: 'fees', label: 'Payment fees', synonyms: ['fees', 'fee', 'stripe fee', 'commission', 'platform fee'] },
  { key: 'ad_spend', label: 'Ad spend', synonyms: ['ad spend', 'ad_spend', 'spend', 'cost', 'marketing'] },
  { key: 'organic_downloads', label: 'Organic downloads', synonyms: ['organic downloads', 'organic_downloads', 'downloads', 'installs', 'units', 'store listing acquisitions'] },
  { key: 'paid_downloads', label: 'Paid downloads', synonyms: ['paid downloads', 'paid_downloads', 'paid installs'] },
  { key: 'purchases', label: 'Purchases', synonyms: ['purchases', 'orders', 'transactions', 'conversions'] },
  { key: 'active_users', label: 'Active users', synonyms: ['active users', 'active_users', 'dau', 'daily active users'] },
];

const SAMPLE_CSV = `date,revenue,fees,ad_spend,organic_downloads,paid_downloads,purchases,active_users
2026-11-20,184.50,5.35,28.00,92,34,12,640
2026-11-21,210.00,6.10,32.50,108,41,15,678
2026-11-22,249.75,7.25,30.00,124,38,18,712`;

const normaliseHeader = (h) => String(h ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[_-]+/g, ' ').trim();

function guessColumns(headers) {
  const norm = headers.map(normaliseHeader);
  const used = new Set();
  const mapping = {};
  for (const field of FIELDS) {
    mapping[field.key] = null;
    for (const syn of field.synonyms) {
      const idx = norm.findIndex((h, i) => !used.has(i) && (h === syn || h.includes(syn)));
      if (idx > -1) {
        mapping[field.key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return mapping;
}

function normalizeIsoDate(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso) return iso[1];
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slash) {
    const [, a, b, y] = slash;
    const month = Number(a) > 12 ? b : a;
    const day = Number(a) > 12 ? a : b;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export default function MetricsCsvImport({ onImported }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const currency = profile?.currency ?? 'USD';

  const [sourceName, setSourceName] = useState('');
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [mapping, setMapping] = useState(null);
  const [readError, setReadError] = useState('');
  const [importing, setImporting] = useState(false);

  const loadCsvText = (text, name) => {
    setReadError('');
    try {
      const result = parseCsv(text);
      if (!result.headers.length || !result.rows.length) {
        setReadError('No header or data rows were found in that CSV.');
        return;
      }
      setSourceName(name);
      setParsed(result);
      setMapping(guessColumns(result.headers));
    } catch {
      setReadError('Could not read that CSV. Export a standard comma-, semicolon-, or tab-separated CSV.');
    }
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setReadError('Keep CSV exports under 5 MB.');
      return;
    }
    loadCsvText(await file.text(), file.name);
  };

  const preview = useMemo(() => {
    if (!parsed || !mapping || mapping.day === null) return null;
    const byDay = new Map();
    let skipped = 0;
    for (const row of parsed.rows) {
      const day = normalizeIsoDate(row[mapping.day]);
      if (!day || day < '2000-01-01' || day > '2100-01-01') {
        skipped++;
        continue;
      }
      const existing = byDay.get(day) ?? {
        user_id: user?.id,
        day,
        source: 'manual',
        revenue: 0,
        fees: 0,
        ad_spend: 0,
        organic_downloads: 0,
        paid_downloads: 0,
        purchases: 0,
        active_users: null,
      };
      const num = (key) => (mapping[key] === null ? 0 : (parseNumber(row[mapping[key]]) ?? 0));
      existing.revenue = Math.round((existing.revenue + num('revenue')) * 100) / 100;
      existing.fees = Math.round((existing.fees + num('fees')) * 100) / 100;
      existing.ad_spend = Math.round((existing.ad_spend + Math.max(0, num('ad_spend'))) * 100) / 100;
      existing.organic_downloads += Math.max(0, Math.round(num('organic_downloads')));
      existing.paid_downloads += Math.max(0, Math.round(num('paid_downloads')));
      existing.purchases += Math.max(0, Math.round(num('purchases')));
      if (mapping.active_users !== null) {
        const dau = parseNumber(row[mapping.active_users]);
        if (dau !== null && dau >= 0) existing.active_users = Math.max(existing.active_users ?? 0, Math.round(dau));
      }
      byDay.set(day, existing);
    }
    const items = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    const totals = items.reduce((t, r) => ({
      revenue: t.revenue + r.revenue,
      downloads: t.downloads + r.organic_downloads + r.paid_downloads,
    }), { revenue: 0, downloads: 0 });
    return { items, skipped, totals };
  }, [parsed, mapping, user?.id]);

  const runImport = async () => {
    if (!preview?.items.length || importing || !user?.id) return;
    setImporting(true);
    const days = preview.items.map((r) => r.day);
    const { data: before } = await supabase
      .from('daily_metrics')
      .select('day, source, revenue, fees, ad_spend, organic_downloads, paid_downloads, purchases, active_users')
      .eq('source', 'manual')
      .in('day', days);

    const { error } = await supabase
      .from('daily_metrics')
      .upsert(preview.items, { onConflict: 'user_id,day,source' });
    setImporting(false);
    if (error) {
      setReadError(friendlyError(error, 'Could not save imported days. Try again.'));
      return;
    }

    const importedDays = days;
    setParsed(null);
    setMapping(null);
    setSourceName('');
    onImported?.();

    toast.show({
      message: `Imported ${importedDays.length} day${importedDays.length === 1 ? '' : 's'} into Overall Income.`,
      actionLabel: 'Undo',
      onAction: async () => {
        await supabase.from('daily_metrics').delete().eq('source', 'manual').in('day', importedDays);
        if (before?.length) {
          await supabase.from('daily_metrics').upsert(before.map((r) => ({ ...r, user_id: user.id })), { onConflict: 'user_id,day,source' });
        }
        onImported?.();
        toast.show({ message: 'CSV import undone.' });
      },
    });
  };

  return (
    <section className="card" id="csv-import" aria-labelledby="csv-import-title">
      <div className="source-head">
        <FileSpreadsheet aria-hidden="true" />
        <div>
          <h2 id="csv-import-title" className="card-title">Universal CSV Metrics Importer (Free)</h2>
          <p className="card-subtitle">Import daily revenue, fees, ad spend, or downloads from Stripe, App Store Connect, Play Console, Lemon Squeezy, or spreadsheets.</p>
        </div>
        <span className="badge badge--success">Free</span>
      </div>

      <div className="page-actions" style={{ marginTop: 12 }}>
        <input id="metrics-csv-file" type="file" accept=".csv,text/csv,text/plain" className="visually-hidden" onChange={pickFile} />
        <label htmlFor="metrics-csv-file" className="btn btn-secondary btn-sm">
          <Upload aria-hidden="true" /> {parsed ? 'Choose another CSV' : 'Upload CSV'}
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => download('vibeassist-metrics-template.csv', SAMPLE_CSV, 'text/csv;charset=utf-8')}>
          <FileDown aria-hidden="true" /> Download template
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadCsvText(SAMPLE_CSV, 'sample-metrics.csv')}>
          Try sample CSV
        </button>
        {sourceName && <span className="field-help">{sourceName}</span>}
      </div>

      {readError && <div style={{ marginTop: 10 }}><Notice tone="error">{readError}</Notice></div>}

      {parsed && mapping && (
        <div style={{ marginTop: 14 }}>
          <div className="grid-4">
            {FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label className="field-label" htmlFor={`csv-map-${f.key}`}>{f.label}{f.required ? ' *' : ''}</label>
                <select
                  id={`csv-map-${f.key}`}
                  className="input-field input-sm"
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}
                >
                  <option value="">{f.required ? 'Pick a column…' : 'Ignore'}</option>
                  {parsed.headers.map((h, idx) => <option key={`${h}-${idx}`} value={idx}>{h || `Column ${idx + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>

          {preview && (
            <div className="page-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-primary" onClick={runImport} disabled={importing || !preview.items.length} aria-busy={importing}>
                {importing ? 'Importing…' : `Import ${preview.items.length} day${preview.items.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setParsed(null); setMapping(null); setSourceName(''); }}>Cancel</button>
              <span className="field-help">
                {preview.items.length ? `${preview.items[0].day} → ${preview.items.at(-1).day} · ${formatMoneyExact(preview.totals.revenue, currency)} revenue · ${formatCount(preview.totals.downloads)} downloads` : 'No valid dates mapped'}
                {preview.skipped ? ` · ${preview.skipped} rows skipped` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
