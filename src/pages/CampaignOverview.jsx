import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Plus } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { friendlyError, supabase } from '../lib/supabase';
import { AD_NETWORKS, CAMPAIGN_STATUSES } from '../lib/options';
import { formatCount, formatMoneyExact, formatPercent } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { usePersistentState } from '../lib/usePersistentState';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';

const emptyCampaign = { network: 'meta', name: '', status: 'active', spend: '', revenue: '', installs: '' };
const roasOf = (c) => (Number(c.spend) > 0 ? (Number(c.revenue) / Number(c.spend)) * 100 : null);
const cacOf = (c) => (c.installs > 0 ? Number(c.spend) / c.installs : null);
const STATUS_LABEL = { active: 'Active', paused: 'Paused', ended: 'Ended' };
const toForm = (c) => ({ ...c, spend: String(c.spend), revenue: String(c.revenue), installs: String(c.installs) });

const COLUMNS = [
  { key: 'name', label: 'Campaign', value: (c) => c.name.toLowerCase() },
  { key: 'spend', label: 'Spend', num: true, value: (c) => Number(c.spend) },
  { key: 'revenue', label: 'Revenue', num: true, value: (c) => Number(c.revenue) },
  { key: 'roas', label: 'ROAS', num: true, value: (c) => roasOf(c) ?? -1, title: 'Return on ad spend: revenue ÷ spend' },
  { key: 'installs', label: 'Installs', num: true, value: (c) => c.installs },
  { key: 'cac', label: 'Cost / install', num: true, value: (c) => cacOf(c) ?? Infinity },
];

function CampaignForm({ initial, currency, onSave, onCancel, saving, error, conflict, onResolve }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const nameField = useRef(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    nameField.current?.focus();
  }, []);

  // Returns the values to save, or null after showing what needs fixing
  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Give the campaign a name.';
    const numbers = { spend: Number(form.spend || 0), revenue: Number(form.revenue || 0), installs: Number(form.installs || 0) };
    for (const key of ['spend', 'revenue', 'installs']) {
      if (!Number.isFinite(numbers[key]) || numbers[key] < 0) next[key] = 'Use zero or more.';
    }
    if (!next.installs && !Number.isInteger(numbers.installs)) next.installs = 'Use a whole number.';
    setErrors(next);
    if (Object.keys(next).length) return null;
    return { network: form.network, name: form.name.trim(), status: form.status, spend: numbers.spend, revenue: numbers.revenue, installs: numbers.installs };
  };

  const submitWith = (choice) => {
    if (saving) return;
    const values = validate();
    if (!values) return;
    if (choice) onResolve(choice);
    onSave(values);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitWith(null);
  };

  const field = (key, label, props) => (
    <div className="field">
      <label className="field-label" htmlFor={`campaign-${key}`}>{label}</label>
      <input id={`campaign-${key}`} className="input-field" value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `campaign-${key}-error` : undefined} {...props} />
      {errors[key] && <span id={`campaign-${key}-error`} className="field-error">{errors[key]}</span>}
    </div>
  );

  return (
    <form className="card card--raised" onSubmit={handleSubmit} noValidate aria-label={initial.id ? `Edit ${initial.name}` : 'Add a campaign'}>
      <div className="grid-3">
        {field('name', 'Campaign name', { ref: nameField, maxLength: 120, placeholder: 'Launch week retargeting' })}
        <div className="field">
          <label className="field-label" htmlFor="campaign-network">Network</label>
          <select id="campaign-network" className="input-field" value={form.network} onChange={set('network')}>
            {Object.entries(AD_NETWORKS).map(([value, network]) => <option key={value} value={value}>{network.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="campaign-status">Status</label>
          <select id="campaign-status" className="input-field" value={form.status} onChange={set('status')}>
            {CAMPAIGN_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
          </select>
        </div>
        {field('spend', `Total spend (${currency})`, { type: 'number', min: 0, step: '0.01', inputMode: 'decimal', placeholder: '0' })}
        {field('revenue', `Revenue it brought in (${currency})`, { type: 'number', min: 0, step: '0.01', inputMode: 'decimal', placeholder: '0' })}
        {field('installs', 'Installs', { type: 'number', min: 0, step: '1', inputMode: 'numeric', placeholder: '0' })}
      </div>
      {error && <div style={{ marginBottom: 14 }}><Notice tone="error">{error}</Notice></div>}
      {conflict && (
        <div style={{ marginBottom: 14 }}>
          <Notice
            tone="warning"
            title={conflict.latest ? 'Changed somewhere else' : 'Deleted somewhere else'}
            actions={conflict.latest ? (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setForm(toForm(conflict.latest)); setErrors({}); onResolve('latest'); }}>Load latest</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => submitWith('mine')}>Save mine anyway</button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => submitWith('recreate')}>Add it back with these values</button>
            )}
          >
            {conflict.latest
              ? `Since you opened it, this campaign was changed in another tab or device. It now has ${formatMoneyExact(conflict.latest.spend, currency)} spend, ${formatMoneyExact(conflict.latest.revenue, currency)} revenue and ${formatCount(conflict.latest.installs)} installs. What you typed is still here.`
              : 'This campaign was deleted in another tab or device. What you typed is still here.'}
          </Notice>
        </div>
      )}
      <div className="page-actions">
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
          {saving ? <><span className="spinner spinner--light" /> Saving…</> : initial.id ? 'Save changes' : 'Add campaign'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

export default function CampaignOverview() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const currency = profile?.currency ?? 'USD';
  const [campaigns, setCampaigns] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // 'new' | campaign id | null
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [conflict, setConflict] = useState(null); // { latest } after a save hit a newer version; latest is null if deleted
  const editVersion = useRef(null); // the updated_at this edit is allowed to overwrite
  const recreate = useRef(false);
  const [statusFilter, setStatusFilter] = usePersistentState('campaign-filter', 'all');
  const [sort, setSort] = usePersistentState('campaign-sort', { key: 'spend', dir: 'desc' });

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('ad_campaigns').select('*').order('created_at');
    if (error) setLoadError(friendlyError(error, 'Could not load your campaigns.'));
    else setLoadError('');
    setCampaigns(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const list = (campaigns ?? []).filter((c) => statusFilter === 'all' || c.status === statusFilter);
    const column = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[1];
    return [...list].sort((a, b) => {
      const x = column.value(a), y = column.value(b);
      const order = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === 'asc' ? order : -order;
    });
  }, [campaigns, statusFilter, sort]);

  const all = campaigns ?? [];
  const totals = all.reduce((t, c) => ({ spend: t.spend + Number(c.spend), revenue: t.revenue + Number(c.revenue), installs: t.installs + c.installs }), { spend: 0, revenue: 0, installs: 0 });
  const roas = roasOf(totals);
  const cac = cacOf(totals);

  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const startEdit = (campaign) => {
    setFormError('');
    setConflict(null);
    recreate.current = false;
    editVersion.current = campaign.updated_at;
    setEditing(campaign.id);
  };

  const closeForm = () => {
    if (conflict) load();
    setEditing(null);
    setFormError('');
    setConflict(null);
    recreate.current = false;
  };

  const resolveConflict = (choice) => {
    if (choice === 'recreate') recreate.current = true;
    else editVersion.current = conflict.latest.updated_at;
    setConflict(null);
    if (choice === 'latest') load();
  };

  const save = async (values) => {
    setSaving(true);
    setFormError('');
    let result;
    if (editing === 'new' || recreate.current) {
      result = await supabase.from('ad_campaigns').insert(editing === 'new' ? values : { ...values, id: editing }).select();
    } else {
      // Only overwrite the version that was opened (or the newer one the user chose to replace)
      result = await supabase.from('ad_campaigns').update(values).eq('id', editing).eq('updated_at', editVersion.current).select();
    }
    if (!result.error && !result.data.length) {
      // Someone else saved first: show what changed and let the user choose. The table keeps
      // its current rows until then so the open form isn't swept away.
      const { data: latest, error: latestError } = await supabase.from('ad_campaigns').select('*').eq('id', editing).maybeSingle();
      setSaving(false);
      if (latestError) setFormError(friendlyError(latestError, 'This campaign changed elsewhere. Check your connection, then save again.'));
      else setConflict({ latest });
      return;
    }
    setSaving(false);
    if (result.error) {
      setFormError(friendlyError(result.error, 'Could not save. Check your connection and try again; your changes are still in the form.'));
      return;
    }
    toast.show({ message: editing === 'new' ? `Added “${values.name}”.` : recreate.current ? `Added “${values.name}” back.` : `Saved “${values.name}”.` });
    recreate.current = false;
    setEditing(null);
    setConflict(null);
    await load();
  };

  const toggleStatus = async (campaign) => {
    const next = campaign.status === 'active' ? 'paused' : 'active';
    const { error } = await supabase.from('ad_campaigns').update({ status: next }).eq('id', campaign.id);
    if (error) toast.show({ message: friendlyError(error, 'Could not change the status. Try again.'), tone: 'error' });
    else toast.show({ message: `“${campaign.name}” is now ${STATUS_LABEL[next].toLowerCase()}.` });
    await load();
  };

  const remove = async (campaign) => {
    const { error } = await supabase.from('ad_campaigns').delete().eq('id', campaign.id);
    if (error) {
      toast.show({ message: friendlyError(error, `Could not delete “${campaign.name}”. Try again.`), tone: 'error' });
      return;
    }
    await load();
    toast.show({
      message: `Deleted “${campaign.name}”.`,
      actionLabel: 'Undo',
      onAction: async () => {
        const { updated_at: _ignored, ...restore } = campaign;
        const { error: undoError } = await supabase.from('ad_campaigns').insert({ ...restore, user_id: user.id });
        if (undoError) toast.show({ message: `Could not restore “${campaign.name}”. Add it again instead.`, tone: 'error' });
        await load();
      },
    });
  };

  const exportCsv = () => {
    downloadCsv('vibeassist-campaigns.csv', [
      { key: 'name', label: 'Campaign' }, { key: 'network', label: 'Network' }, { key: 'status', label: 'Status' },
      { key: 'spend', label: `Spend (${currency})` }, { key: 'revenue', label: `Revenue (${currency})` }, { key: 'installs', label: 'Installs' },
      { key: 'roas', label: 'ROAS %' }, { key: 'cac', label: 'Cost per install' },
    ], all.map((c) => ({ ...c, network: AD_NETWORKS[c.network].label, status: STATUS_LABEL[c.status], roas: roasOf(c)?.toFixed(1) ?? '', cac: cacOf(c)?.toFixed(2) ?? '' })));
    toast.show({ message: `Exported ${all.length} ${all.length === 1 ? 'campaign' : 'campaigns'}.` });
  };

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Spend, revenue and installs for each ad campaign. Enter results from each network's dashboard; accounts can't be linked yet."
      >
        {all.length > 0 && <button type="button" className="btn btn-secondary" onClick={exportCsv}><Download aria-hidden="true" /> Export CSV</button>}
        <button type="button" className="btn btn-primary" onClick={() => { setFormError(''); setEditing('new'); }} disabled={editing !== null}>
          <Plus aria-hidden="true" /> Add campaign
        </button>
      </PageHeader>

      {loadError && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice>}

      {editing === 'new' && (
        <div className="section">
          <CampaignForm initial={emptyCampaign} currency={currency} onSave={save} onCancel={closeForm} saving={saving} error={formError} />
        </div>
      )}

      {campaigns === null ? (
        <div className="skeleton section" style={{ height: 160 }} aria-busy="true" aria-label="Loading campaigns" />
      ) : all.length === 0 ? (
        editing !== 'new' && (
          <div className="card empty-state section">
            <h2>No campaigns yet</h2>
            <p>Add a campaign with its total spend, the revenue it brought in and its installs to see return on ad spend and cost per install.</p>
            <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setEditing('new')}><Plus aria-hidden="true" /> Add your first campaign</button>
          </div>
        )
      ) : (
        <>
          <div className="stat-grid section" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="card stat"><p className="stat-label">Total spend</p><p className="stat-value">{formatMoneyExact(totals.spend, currency)}</p><p className="stat-change">{all.length} {all.length === 1 ? 'campaign' : 'campaigns'}</p></div>
            <div className="card stat">
              <p className="stat-label">Return on ad spend</p>
              <p className="stat-value">{roas === null ? '—' : formatPercent(roas)}</p>
              <p className={`stat-change ${roas === null ? '' : roas >= 100 ? 'stat-change--up' : 'stat-change--down'}`}>{roas === null ? 'Needs spend' : roas >= 100 ? 'Revenue covers spend' : 'Spending more than it earns'}</p>
            </div>
            <div className="card stat"><p className="stat-label">Cost per install</p><p className="stat-value">{cac === null ? '—' : formatMoneyExact(cac, currency)}</p><p className="stat-change">{cac === null ? 'Needs installs' : `${formatCount(totals.installs)} installs`}</p></div>
          </div>

          <section className="section" aria-labelledby="campaigns-title">
            <div className="section-header">
              <h2 id="campaigns-title">All campaigns</h2>
              <div className="segmented" role="group" aria-label="Show">
                {['all', ...CAMPAIGN_STATUSES].map((s) => (
                  <button key={s} type="button" aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)}>
                    {s === 'all' ? 'All' : STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="card card--flush">
              <div className="table-wrap">
                <table className="table table-stack">
                  <thead>
                    <tr>
                      {COLUMNS.map((col) => (
                        <th key={col.key} scope="col" className={col.num ? 'num' : undefined} aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title={col.title}>
                          <button type="button" onClick={() => toggleSort(col.key)}>
                            {col.label}
                            {sort.key === col.key && (sort.dir === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />)}
                          </button>
                        </th>
                      ))}
                      <th scope="col" className="actions"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 && (
                      <tr><td colSpan={COLUMNS.length + 1} className="muted">No {STATUS_LABEL[statusFilter]?.toLowerCase()} campaigns.</td></tr>
                    )}
                    {visible.map((c) => {
                      const r = roasOf(c);
                      if (editing === c.id) {
                        return (
                          <tr key={c.id}><td colSpan={COLUMNS.length + 1} style={{ padding: 12 }}>
                            <CampaignForm initial={toForm(c)} currency={currency} onSave={save} onCancel={closeForm} saving={saving} error={formError} conflict={conflict} onResolve={resolveConflict} />
                          </td></tr>
                        );
                      }
                      return (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.name}</strong>
                            <div className="field-help">{AD_NETWORKS[c.network].label} · <span className={`badge ${c.status === 'active' ? 'badge--success' : ''}`}>{STATUS_LABEL[c.status]}</span></div>
                          </td>
                          <td className="num" data-label="Spend">{formatMoneyExact(c.spend, currency)}</td>
                          <td className="num" data-label="Revenue">{formatMoneyExact(c.revenue, currency)}</td>
                          <td className="num" data-label="ROAS"><span className={r === null ? '' : r >= 100 ? 'text-up' : 'text-down'}>{r === null ? '—' : formatPercent(r)}</span></td>
                          <td className="num" data-label="Installs">{formatCount(c.installs)}</td>
                          <td className="num" data-label="Cost / install">{cacOf(c) === null ? '—' : formatMoneyExact(cacOf(c), currency)}</td>
                          <td className="actions">
                            {c.status !== 'ended' && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleStatus(c)}>
                                {c.status === 'active' ? 'Pause' : 'Resume'}<span className="visually-hidden"> {c.name}</span>
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(c)} disabled={editing !== null}>
                              Edit<span className="visually-hidden"> {c.name}</span>
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(c)}>
                              Delete<span className="visually-hidden"> {c.name}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
