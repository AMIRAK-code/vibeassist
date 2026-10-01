import React, { useCallback, useEffect, useState } from 'react';
import { Target, BarChart2, Maximize, Plus, Pencil, Trash2, Pause, Play } from 'lucide-react';
import { useAuth } from '../context/auth';
import { friendlyError, supabase } from '../lib/supabase';
import { AD_NETWORKS, CAMPAIGN_STATUSES } from '../lib/options';
import { formatCount, formatMoneyExact, formatPercent } from '../lib/format';

const emptyCampaign = { network: 'meta', name: '', status: 'active', spend: '', revenue: '', installs: '' };

function CampaignForm({ initial, currency, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    const numbers = { spend: Number(form.spend || 0), revenue: Number(form.revenue || 0), installs: Math.round(Number(form.installs || 0)) };
    if (!form.name.trim()) return setError('Give the campaign a name.');
    if (Object.values(numbers).some((n) => !Number.isFinite(n) || n < 0)) return setError('Spend, revenue and installs must be zero or more.');
    setError('');
    onSave({ network: form.network, name: form.name.trim(), status: form.status, ...numbers });
  };

  return (
    <form className="glass-panel" onSubmit={handleSubmit}>
      <div className="grid-3" style={{ gap: '16px' }}>
        <div className="input-group">
          <label className="input-label" htmlFor="campaign-name">Campaign name</label>
          <input id="campaign-name" className="input-field" maxLength={120} value={form.name} onChange={set('name')} placeholder="Launch week retargeting" />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="campaign-network">Network</label>
          <select id="campaign-network" className="input-field" value={form.network} onChange={set('network')}>
            {Object.entries(AD_NETWORKS).map(([value, network]) => <option key={value} value={value}>{network.label}</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="campaign-status">Status</label>
          <select id="campaign-status" className="input-field" value={form.status} onChange={set('status')}>
            {CAMPAIGN_STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="campaign-spend">Spend ({currency})</label>
          <input id="campaign-spend" type="number" min="0" step="0.01" className="input-field" value={form.spend} onChange={set('spend')} placeholder="0" />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="campaign-revenue">Revenue from it ({currency})</label>
          <input id="campaign-revenue" type="number" min="0" step="0.01" className="input-field" value={form.revenue} onChange={set('revenue')} placeholder="0" />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="campaign-installs">Installs</label>
          <input id="campaign-installs" type="number" min="0" step="1" className="input-field" value={form.installs} onChange={set('installs')} placeholder="0" />
        </div>
      </div>
      {error && <p role="alert" style={{ color: '#d93025', fontSize: '0.9rem' }}>{error}</p>}
      <div className="flex-center gap-4" style={{ justifyContent: 'flex-start' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save campaign'}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function CampaignOverview() {
  const { profile } = useAuth();
  const currency = profile?.currency ?? 'USD';
  const [campaigns, setCampaigns] = useState(null);
  const [editing, setEditing] = useState(null); // 'new', a campaign id, or null
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('ad_campaigns').select('*').order('created_at');
    if (loadError) setError(friendlyError(loadError, 'Could not load your campaigns.'));
    setCampaigns(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (values) => {
    setSaving(true);
    setError('');
    const query = editing === 'new'
      ? supabase.from('ad_campaigns').insert(values)
      : supabase.from('ad_campaigns').update(values).eq('id', editing);
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) return setError(friendlyError(saveError, 'Could not save the campaign.'));
    setEditing(null);
    await load();
  };

  const toggleStatus = async (campaign) => {
    const { error: updateError } = await supabase
      .from('ad_campaigns')
      .update({ status: campaign.status === 'active' ? 'paused' : 'active' })
      .eq('id', campaign.id);
    if (updateError) setError(friendlyError(updateError, 'Could not update the campaign.'));
    await load();
  };

  const remove = async (campaign) => {
    if (!window.confirm(`Delete "${campaign.name}"? This can't be undone.`)) return;
    const { error: deleteError } = await supabase.from('ad_campaigns').delete().eq('id', campaign.id);
    if (deleteError) setError(friendlyError(deleteError, 'Could not delete the campaign.'));
    await load();
  };

  const list = campaigns ?? [];
  const totals = list.reduce(
    (t, c) => ({ spend: t.spend + Number(c.spend), revenue: t.revenue + Number(c.revenue), installs: t.installs + c.installs }),
    { spend: 0, revenue: 0, installs: 0 },
  );
  const roas = totals.spend > 0 ? (totals.revenue / totals.spend) * 100 : null;
  const cac = totals.installs > 0 ? totals.spend / totals.installs : null;

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Centralized <span className="text-gradient">Ad Manager</span></h2>
          <p className="input-label mt-4">
            Track campaigns across Meta, Google, YouTube, X, Apple Search Ads, and TikTok in one place.
            Ad network accounts can't be linked yet, so enter each campaign's results here.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={editing !== null}>
          <Plus size={18} /> Add campaign
        </button>
      </div>

      <div className="grid-3 mt-4">
        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Total Ad Spend</h4>
            <Target className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '1.8rem' }}>{formatMoneyExact(totals.spend, currency)}</h2>
          <p className="input-label" style={{ fontSize: '0.8rem', marginTop: '8px' }}>Across {list.length} tracked campaigns</p>
        </div>
        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Avg. ROAS</h4>
            <BarChart2 className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '1.8rem' }}>{roas === null ? '—' : formatPercent(roas)}</h2>
          <p className="input-label" style={{ fontSize: '0.8rem', marginTop: '8px' }}>
            {roas === null ? 'Needs spend to calculate' : roas >= 100 ? 'Campaigns earn back their spend' : 'Campaigns cost more than they earn'}
          </p>
        </div>
        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Avg. CAC</h4>
            <Maximize className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '1.8rem' }}>{cac === null ? '—' : formatMoneyExact(cac, currency)}</h2>
          <p className="input-label" style={{ fontSize: '0.8rem', marginTop: '8px' }}>{cac === null ? 'Needs installs to calculate' : 'Spend per install'}</p>
        </div>
      </div>

      {error && <p role="alert" style={{ color: '#d93025', marginTop: '16px' }}>{error}</p>}

      {editing === 'new' && (
        <div className="mt-4">
          <CampaignForm initial={emptyCampaign} currency={currency} onSave={save} onCancel={() => setEditing(null)} saving={saving} />
        </div>
      )}

      <h3 className="mt-4 mb-4">Tracked Campaigns</h3>

      {campaigns === null && <div className="spinner" role="status" aria-label="Loading campaigns" />}
      {campaigns !== null && list.length === 0 && editing !== 'new' && (
        <div className="glass-panel text-center">
          <p className="input-label">No campaigns yet. Add one to see your ad spend, ROAS and cost per install.</p>
        </div>
      )}

      <div className="flex-column gap-4">
        {list.map((campaign) => {
          const network = AD_NETWORKS[campaign.network];
          if (editing === campaign.id) {
            return (
              <CampaignForm
                key={campaign.id}
                initial={{ ...campaign, spend: String(campaign.spend), revenue: String(campaign.revenue), installs: String(campaign.installs) }}
                currency={currency}
                onSave={save}
                onCancel={() => setEditing(null)}
                saving={saving}
              />
            );
          }
          return (
            <div key={campaign.id} className="glass-panel flex-between" style={{ padding: '16px 24px', flexWrap: 'wrap', gap: '12px' }}>
              <div className="flex-center gap-4">
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: network.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.9rem' }}>{network.short}</span>
                </div>
                <div>
                  <h4>{campaign.name}</h4>
                  <p className="input-label" style={{ fontSize: '0.8rem' }}>
                    {network.label} • {campaign.status[0].toUpperCase() + campaign.status.slice(1)} • Spend {formatMoneyExact(campaign.spend, currency)} •
                    {' '}Revenue {formatMoneyExact(campaign.revenue, currency)} • {formatCount(campaign.installs)} installs
                  </p>
                </div>
              </div>
              <div className="flex-center gap-4">
                {campaign.status !== 'ended' && (
                  <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => toggleStatus(campaign)} aria-label={campaign.status === 'active' ? 'Pause campaign' : 'Resume campaign'}>
                    {campaign.status === 'active' ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                )}
                <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => setEditing(campaign.id)} disabled={editing !== null} aria-label="Edit campaign">
                  <Pencil size={16} />
                </button>
                <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => remove(campaign)} aria-label="Delete campaign">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
