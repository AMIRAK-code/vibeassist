import React, { useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { friendlyError, supabase } from '../lib/supabase';
import { parseCsv } from '../lib/csv';
import { buildImport, guessMapping, IMPORT_FIELDS, planImport } from '../lib/campaignImport';
import { AD_NETWORKS } from '../lib/options';
import { formatCount, formatMoneyExact } from '../lib/format';
import Notice from './ui/Notice';

const MAX_BYTES = 5 * 1024 * 1024;

// Imports a campaign report exported from an ad network's dashboard. Nothing is written
// until the user has checked the columns and the preview.
export default function CampaignImport({ network, campaigns, currency, onImported, onCancel }) {
  const networkLabel = AD_NETWORKS[network].label;
  const [file, setFile] = useState(null); // { name, headers, rows }
  const [mapping, setMapping] = useState(null);
  const [readError, setReadError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const fileInput = useRef(null);

  const readFile = async (picked) => {
    setReadError('');
    setImportError('');
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      setReadError('That file is larger than 5 MB. Export the campaign summary rather than every day or ad.');
      return;
    }
    try {
      const parsed = parseCsv(await picked.text());
      if (!parsed.headers.length || !parsed.rows.length) {
        setReadError('That file has no rows to import. Export the report as CSV with one row per campaign.');
        return;
      }
      setFile({ name: picked.name, ...parsed });
      setMapping(guessMapping(parsed.headers));
    } catch {
      setReadError("Couldn't read that file. Export the report as CSV and try again.");
    }
  };

  const ready = mapping && mapping.name !== null && mapping.spend !== null;
  const built = useMemo(() => (ready ? buildImport(file.rows, mapping) : null), [ready, file, mapping]);
  const plan = useMemo(() => (built ? planImport(campaigns, network, built.items) : null), [built, campaigns, network]);

  const runImport = async () => {
    if (!plan || importing) return;
    setImporting(true);
    setImportError('');
    const updated = [];
    let failed = 0;
    const results = await Promise.all(plan.updates.map((u) => supabase.from('ad_campaigns').update(u.values).eq('id', u.id).select('id')));
    results.forEach((result, i) => {
      if (result.error || !result.data?.length) failed++;
      else updated.push(plan.updates[i].before);
    });
    let inserted = [];
    if (plan.inserts.length) {
      const { data, error } = await supabase.from('ad_campaigns').insert(plan.inserts).select('id');
      if (error) {
        failed += plan.inserts.length;
        if (!updated.length) {
          setImporting(false);
          setImportError(friendlyError(error, 'Nothing was imported. Check your connection and try again.'));
          return;
        }
      } else {
        inserted = data.map((row) => row.id);
      }
    }
    setImporting(false);
    onImported({ network, updated, inserted, failed, skipped: plan.ambiguous.length });
  };

  const column = (key) => mapping?.[key] ?? '';

  return (
    <div className="card card--raised campaign-import" role="region" aria-label={`Import ${networkLabel} report`}>
      <div className="section-header">
        <h3 className="card-title">Import a {networkLabel} report</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={importing}>Close</button>
      </div>
      <p className="field-help">
        In {AD_NETWORKS[network].short}'s ads dashboard, export your campaigns as CSV for the date range you track (one row per campaign works best).
        Totals from the report replace the spend, revenue and installs of campaigns with the same name.
      </p>

      <div className="page-actions" style={{ marginTop: 12 }}>
        <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain" className="visually-hidden" id={`import-${network}`} onChange={(e) => readFile(e.target.files?.[0])} />
        <label htmlFor={`import-${network}`} className="btn btn-secondary">
          <Upload aria-hidden="true" /> {file ? 'Choose another file' : 'Choose CSV file'}
        </label>
        {file && <span className="field-help">{file.name} · {formatCount(file.rows.length)} rows</span>}
      </div>
      {readError && <div style={{ marginTop: 10 }}><Notice tone="error">{readError}</Notice></div>}

      {file && (
        <>
          <fieldset className="import-mapping">
            <legend className="field-label">Which column is which?</legend>
            <div className="grid-3">
              {IMPORT_FIELDS.map((field) => (
                <div className="field" key={field.key}>
                  <label className="field-label" htmlFor={`map-${network}-${field.key}`}>{field.label}{field.required ? '' : ' (optional)'}</label>
                  <select
                    id={`map-${network}-${field.key}`}
                    className="input-field"
                    value={column(field.key)}
                    onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">{field.required ? 'Pick a column' : 'Not in this file'}</option>
                    {file.headers.map((h, i) => <option key={`${h}-${i}`} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!ready && <p className="field-error">Pick the campaign name and spend columns to continue.</p>}
            {mapping?.revenue !== null && <p className="field-help">Revenue should be in {currency}, the currency on your account.</p>}
          </fieldset>

          {plan && (
            <>
              <p className="import-summary" role="status">
                {plan.updates.length} to update · {plan.inserts.length} new
                {plan.ambiguous.length > 0 && ` · ${plan.ambiguous.length} skipped (more than one campaign has that name: ${plan.ambiguous.join(', ')})`}
                {built.problems.length > 0 && ` · ${built.problems.length} rows not readable`}
              </p>
              {built.problems.length > 0 && (
                <ul className="field-help import-problems">
                  {built.problems.slice(0, 5).map((p) => <li key={p.row}>Row {p.row}: {p.reason}</li>)}
                </ul>
              )}
              {plan.updates.length + plan.inserts.length > 0 ? (
                <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Campaign</th>
                        <th scope="col" className="num">Spend</th>
                        <th scope="col" className="num">Revenue</th>
                        <th scope="col" className="num">Installs</th>
                        <th scope="col">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.updates.map((u) => (
                        <tr key={u.id}>
                          <td>{u.name}</td>
                          <td className="num">{formatMoneyExact(u.values.spend, currency)}</td>
                          <td className="num">{u.values.revenue === undefined ? '—' : formatMoneyExact(u.values.revenue, currency)}</td>
                          <td className="num">{u.values.installs === undefined ? '—' : formatCount(u.values.installs)}</td>
                          <td><span className="badge">Update</span></td>
                        </tr>
                      ))}
                      {plan.inserts.map((c) => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td className="num">{formatMoneyExact(c.spend, currency)}</td>
                          <td className="num">{formatMoneyExact(c.revenue, currency)}</td>
                          <td className="num">{formatCount(c.installs)}</td>
                          <td><span className="badge badge--cobalt">New</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Notice tone="warning">No campaigns found in this file. Check that the campaign name column is right.</Notice>
              )}
              {importError && <div style={{ marginTop: 10 }}><Notice tone="error">{importError}</Notice></div>}
              <div className="page-actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={runImport} disabled={importing || plan.updates.length + plan.inserts.length === 0} aria-busy={importing}>
                  {importing ? <><span className="spinner spinner--light" /> Importing…</> : `Import ${plan.updates.length + plan.inserts.length} ${plan.updates.length + plan.inserts.length === 1 ? 'campaign' : 'campaigns'}`}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={importing}>Cancel</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
