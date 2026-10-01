import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Download, TrendingUp, Users, Plus, FlaskConical, Trash2, RefreshCw } from 'lucide-react';
import { ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAuth } from '../context/auth';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { buildSampleRows, fetchMetrics, summarize } from '../lib/metrics';
import { formatCompactCount, formatCompactMoney, formatCount, formatGrowth, formatMoney, formatPercent } from '../lib/format';
import MetricEntryForm from '../components/MetricEntryForm';

const PERIOD_DAYS = 30;
const DOWNLOAD_KEYS = ['paidDownloads', 'organicDownloads'];
const growthColor = (percent) => (percent >= 0 ? '#2B75E8' : '#FF3B30');

// Percentage change against the previous period, or null when there is nothing to compare with
const growth = (current, previous) => (previous > 0 ? ((current - previous) / previous) * 100 : null);

function StatCard({ title, icon: Icon, value, change, changeLabel }) {
  return (
    <div className="glass-panel">
      <div className="flex-between">
        <h4 className="input-label">{title}</h4>
        <Icon className="text-gradient" size={20} />
      </div>
      <h2 className="mt-4" style={{ fontSize: '2rem' }}>{value}</h2>
      <p style={{ color: change === null ? 'var(--text-secondary)' : growthColor(change), fontSize: '0.8rem', marginTop: '8px', fontWeight: 'bold' }}>
        {change === null ? changeLabel : `${formatGrowth(change)} ${changeLabel}`}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { user, profile, hasPremium } = useAuth();
  const currency = profile?.currency ?? 'USD';
  const [rows, setRows] = useState(null); // null while loading
  const [stripeConnected, setStripeConnected] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [showEntry, setShowEntry] = useState(false);

  // Two periods: the cards compare the last 30 days with the 30 before
  const load = useCallback(async () => {
    const [metrics, stripe] = await Promise.all([
      fetchMetrics(PERIOD_DAYS * 2),
      supabase.from('integrations').select('status').eq('provider', 'stripe').maybeSingle(),
    ]);
    if (metrics.error) {
      setError(friendlyError(metrics.error, 'Could not load your metrics. Try again.'));
      setRows((previous) => previous ?? []);
      return;
    }
    setRows(metrics.data);
    setStripeConnected(stripe.data?.status === 'connected');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => summarize(rows ?? [], PERIOD_DAYS), [rows]);
  const { current, previous, chartData, latestActiveUsers, sources } = summary;
  const hasData = rows !== null && rows.length > 0;
  const hasSample = sources.includes('sample');

  const run = async (label, task) => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await task();
    } finally {
      setBusy('');
    }
  };

  const handleRefresh = () => run('refresh', async () => {
    if (hasPremium && stripeConnected) {
      const { data, status } = await callFunction('stripe-sync', { action: 'sync' });
      if (status === 200) setNotice(`Imported ${formatCount(data.transactions)} Stripe transactions.`);
      else setError(data.error ?? 'Could not refresh Stripe.');
    }
    await load();
  });

  const handleLoadSample = () => run('sample', async () => {
    const { error: sampleError } = await supabase
      .from('daily_metrics')
      .upsert(buildSampleRows(user.id), { onConflict: 'user_id,day,source' });
    if (sampleError) setError(friendlyError(sampleError, 'Could not add sample data.'));
    await load();
  });

  const handleRemoveSample = () => run('remove-sample', async () => {
    const { error: removeError } = await supabase.from('daily_metrics').delete().eq('source', 'sample');
    if (removeError) setError(friendlyError(removeError, 'Could not remove sample data.'));
    await load();
  });

  const handleSaved = async (day) => {
    setShowEntry(false);
    setNotice(`Saved ${day}.`);
    await load();
  };

  const greeting = profile?.name ? `Welcome back, ${profile.name}. ` : '';
  const conversion = current.downloads > 0 ? (current.purchases / current.downloads) * 100 : null;
  const previousConversion = previous.downloads > 0 ? (previous.purchases / previous.downloads) * 100 : null;
  const comparisonLabel = 'vs. previous 30 days';
  const noComparison = 'No earlier data to compare';

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Your <span className="text-gradient">Empire HUD</span></h2>
          <p className="input-label mt-4" style={{ marginTop: '4px' }}>{greeting}Your last {PERIOD_DAYS} days across every connected source.</p>
          {profile && (
            <p className="input-label" style={{ marginTop: '4px', fontSize: '0.8rem' }}>
              Monthly target: {profile.profit_expectancy}
              {profile.goals.length > 0 && ` · Goals: ${profile.goals.join(', ')}`}
            </p>
          )}
        </div>
        <div className="flex-center gap-4" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowEntry((open) => !open)}>
            <Plus size={18} /> Add data
          </button>
          <button className="btn btn-primary" onClick={handleRefresh} disabled={Boolean(busy)}>
            <RefreshCw size={18} /> {busy === 'refresh' ? 'Refreshing…' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {error && <p role="alert" style={{ color: '#d93025', marginBottom: '12px' }}>{error}</p>}
      {notice && <p role="status" style={{ color: 'var(--accent-1)', marginBottom: '12px' }}>{notice}</p>}

      {hasSample && (
        <div className="glass-panel mb-4 flex-between" style={{ padding: '12px 20px', flexWrap: 'wrap', gap: '12px' }}>
          <p style={{ fontSize: '0.9rem' }}>
            <FlaskConical size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            <strong>Sample data is mixed in.</strong> These numbers are made up to show how the dashboard works.
          </p>
          <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.85rem' }} onClick={handleRemoveSample} disabled={Boolean(busy)}>
            <Trash2 size={16} /> {busy === 'remove-sample' ? 'Removing…' : 'Remove sample data'}
          </button>
        </div>
      )}

      {showEntry && (
        <MetricEntryForm userId={user.id} currency={currency} onSaved={handleSaved} onCancel={() => setShowEntry(false)} />
      )}

      {rows === null && (
        <div className="flex-center" style={{ padding: '80px' }} role="status" aria-label="Loading your metrics">
          <div className="spinner" />
        </div>
      )}

      {rows !== null && !hasData && !showEntry && (
        <div className="glass-panel mt-4 text-center" style={{ padding: '48px 24px' }}>
          <h3>No numbers yet</h3>
          <p className="input-label mt-4" style={{ maxWidth: '520px', margin: '16px auto 0' }}>
            Your dashboard is built from your real data. Add a day by hand, connect Stripe or your own app, or load sample data to see how it works.
          </p>
          <div className="flex-center gap-4 mt-4" style={{ flexWrap: 'wrap', marginTop: '24px' }}>
            <button className="btn btn-primary" onClick={() => setShowEntry(true)}><Plus size={18} /> Add a day</button>
            <Link to={hasPremium ? '/integrations' : '/premium'} className="btn btn-secondary" style={{ textDecoration: 'none' }}>
              Connect Stripe or your app
            </Link>
            <button className="btn btn-secondary" onClick={handleLoadSample} disabled={Boolean(busy)}>
              <FlaskConical size={18} /> {busy === 'sample' ? 'Loading…' : 'Load sample data'}
            </button>
          </div>
        </div>
      )}

      {hasData && (
        <>
          <div className="grid-4 mt-4">
            <StatCard
              title="Total Revenue"
              icon={DollarSign}
              value={formatMoney(current.revenue, currency)}
              change={growth(current.revenue, previous.revenue)}
              changeLabel={growth(current.revenue, previous.revenue) === null ? noComparison : comparisonLabel}
            />
            <StatCard
              title="Downloads"
              icon={Download}
              value={formatCount(current.downloads)}
              change={growth(current.downloads, previous.downloads)}
              changeLabel={growth(current.downloads, previous.downloads) === null ? noComparison : comparisonLabel}
            />
            <StatCard
              title="Conversion Rate"
              icon={TrendingUp}
              value={conversion === null ? '—' : formatPercent(conversion)}
              change={conversion !== null && previousConversion !== null ? growth(conversion, previousConversion) : null}
              changeLabel={conversion === null ? 'Purchases ÷ downloads' : previousConversion === null ? noComparison : comparisonLabel}
            />
            <StatCard
              title="Active Users"
              icon={Users}
              value={latestActiveUsers === null ? '—' : formatCount(latestActiveUsers)}
              change={null}
              changeLabel={latestActiveUsers === null ? 'Not reported yet' : 'Latest reported day'}
            />
          </div>

          <div className="glass-panel mt-4" style={{ height: '450px', padding: '32px', display: 'flex', flexDirection: 'column' }}>
            <h3 className="mb-4">Comprehensive Growth & Profit Analysis</h3>
            {/* The chart gets the space left under the heading, so it can't overflow the panel */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <defs>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2B75E8" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#2B75E8" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8CB9F0" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#8CB9F0" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="label" stroke="#888" tick={{ fill: '#888' }} minTickGap={16} />
                  {/* Money on the left axis, downloads on the right, so neither scale distorts the other */}
                  <YAxis
                    yAxisId="money"
                    stroke="#888"
                    tick={{ fill: '#888' }}
                    tickFormatter={(value) => formatCompactMoney(value, currency)}
                    label={{ value: `Revenue & spend (${currency})`, angle: -90, position: 'insideLeft', fill: '#888', style: { textAnchor: 'middle' } }}
                  />
                  <YAxis
                    yAxisId="downloads"
                    orientation="right"
                    stroke="#888"
                    tick={{ fill: '#888' }}
                    tickFormatter={formatCompactCount}
                    label={{ value: 'Downloads', angle: 90, position: 'insideRight', fill: '#888', style: { textAnchor: 'middle' } }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FAF9F6', borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                    itemStyle={{ fontWeight: 'bold' }}
                    formatter={(value, name, item) => (DOWNLOAD_KEYS.includes(item.dataKey) ? formatCount(value) : formatMoney(value, currency))}
                  />
                  <Legend verticalAlign="top" height={36}/>

                  {/* The multi-layered chart */}
                  <Area yAxisId="money" type="monotone" dataKey="revenue" name="Gross Revenue" fill="url(#colorRevenue)" stroke="#8CB9F0" strokeWidth={2} />
                  <Area yAxisId="money" type="monotone" dataKey="profit" name="Net Profit" fill="url(#colorProfit)" stroke="#2B75E8" strokeWidth={3} />

                  <Bar yAxisId="downloads" dataKey="paidDownloads" name="Paid Acquisition" barSize={6} fill="#2B75E8" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="downloads" dataKey="organicDownloads" name="Organic Installs" barSize={6} fill="#FCC624" radius={[4, 4, 0, 0]} />

                  <Line yAxisId="money" type="monotone" dataKey="adSpend" name="Ad Spend" stroke="#000" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="input-label mt-4" style={{ fontSize: '0.8rem' }}>
            Net profit is revenue minus payment fees and ad spend. Sources: {sources.join(', ')}.
          </p>
        </>
      )}
    </div>
  );
}
