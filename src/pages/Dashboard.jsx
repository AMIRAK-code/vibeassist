import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Download, RefreshCw, PencilLine, FlaskConical, Plug, ArrowRight, ListChecks, Trash2 } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { buildSampleRows, fetchMetrics, formatDay, METRIC_COLUMNS, relativeDay, SOURCE_LABELS, summarize } from '../lib/metrics';
import { formatCompactCount, formatCompactMoney, formatCount, formatMoney, formatMoneyExact, formatPercent } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { usePersistentState } from '../lib/usePersistentState';
import { PERIODS } from '../lib/options';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';
import MetricEntryForm from '../components/MetricEntryForm';

const CHART_METRICS = [
  { key: 'revenue', label: 'Revenue', money: true },
  { key: 'profit', label: 'Profit', money: true },
  { key: 'downloads', label: 'Downloads' },
  { key: 'adSpend', label: 'Ad spend', money: true },
];


// Percentage change against the previous period, or null when there is nothing to compare with
const change = (current, previous) => (previous > 0 ? ((current - previous) / previous) * 100 : null);

function Stat({ label, value, delta, periodDays, hint }) {
  const tone = delta === null || delta === undefined ? '' : delta >= 0 ? ' stat-change--up' : ' stat-change--down';
  return (
    <div className="card stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className={`stat-change${tone}`}>
        {delta === null || delta === undefined ? hint ?? `No data for the ${periodDays} days before` : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs previous ${periodDays} days`}
      </p>
    </div>
  );
}

function StartOption({ icon: Icon, title, text, action }) {
  return (
    <div className="start-option">
      <Icon aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}

export default function Dashboard() {
  const { user, profile, hasPremium } = useAuth();
  const toast = useToast();
  const currency = profile?.currency ?? 'USD';
  const [period, setPeriod] = usePersistentState('overview-period', 30);
  const [metric, setMetric] = usePersistentState('overview-metric', 'revenue');
  const [rows, setRows] = useState(null); // null while loading
  const [totalRows, setTotalRows] = useState(null);
  const [stripe, setStripe] = useState(null);
  const [latestPlan, setLatestPlan] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [entry, setEntry] = useState(null); // { day } while the form is open

  const load = useCallback(async () => {
    const [metrics, count, integration, plan] = await Promise.all([
      fetchMetrics(period * 2),
      supabase.from('daily_metrics').select('day', { count: 'exact', head: true }),
      supabase.from('integrations').select('status, last_synced_at, account_label').eq('provider', 'stripe').maybeSingle(),
      hasPremium
        ? supabase.from('advisor_plans').select('id, created_at, plan_steps(status)').order('created_at', { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (metrics.error || count.error) {
      setLoadError(friendlyError(metrics.error ?? count.error, 'Could not load your numbers.'));
      setRows((previous) => previous ?? []);
      return;
    }
    setLoadError('');
    setRows(metrics.data);
    setTotalRows(count.count ?? 0);
    setStripe(integration.data?.status === 'connected' ? integration.data : null);
    setLatestPlan(plan.data ?? null);
  }, [period, hasPremium]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => summarize(rows ?? [], period), [rows, period]);
  const { current, previous, chartData, latestActiveUsers, sources } = summary;
  const manualEntries = useMemo(
    () => Object.fromEntries((rows ?? []).filter((r) => r.source === 'manual').map((r) => [r.day, r])),
    [rows],
  );
  const manualList = useMemo(() => Object.values(manualEntries).sort((a, b) => b.day.localeCompare(a.day)), [manualEntries]);
  const latestDay = useMemo(() => (rows ?? []).reduce((max, r) => (r.day > max ? r.day : max), ''), [rows]);
  const hasSample = sources.includes('sample');
  const firstUse = totalRows === 0;

  const profit = current.revenue - current.fees - current.adSpend;
  const previousProfit = previous.revenue - previous.fees - previous.adSpend;
  const conversion = current.downloads > 0 && current.purchases > 0 ? (current.purchases / current.downloads) * 100 : null;
  const previousConversion = previous.downloads > 0 && previous.purchases > 0 ? (previous.purchases / previous.downloads) * 100 : null;
  const chartMetric = CHART_METRICS.find((m) => m.key === metric) ?? CHART_METRICS[0];
  const planSteps = latestPlan?.plan_steps?.filter((s) => s.status !== 'dismissed' && s.status !== 'suggested') ?? [];
  const planDone = planSteps.filter((s) => s.status === 'done').length;

  const run = async (label, task) => {
    if (busy) return;
    setBusy(label);
    try {
      await task();
    } finally {
      setBusy('');
    }
  };

  const syncStripe = () => run('sync', async () => {
    const { data, status } = await callFunction('stripe-sync', { action: 'sync' });
    if (status === 200) toast.show({ message: `Stripe synced: ${formatCount(data.transactions)} transactions across ${data.days} days.` });
    else toast.show({ message: data?.error ?? 'Stripe sync failed. Try again from Data sources.', tone: 'error' });
    await load();
  });

  const loadSample = () => run('sample', async () => {
    const { error } = await supabase.from('daily_metrics').upsert(buildSampleRows(user.id), { onConflict: 'user_id,day,source' });
    if (error) toast.show({ message: friendlyError(error, 'Could not add sample data. Try again.'), tone: 'error' });
    else toast.show({ message: 'Added 60 days of sample data. Remove it any time from this page.' });
    await load();
  });

  const removeSample = () => run('remove-sample', async () => {
    const { data: removed, error } = await supabase.from('daily_metrics').delete().eq('source', 'sample').select(METRIC_COLUMNS + ', user_id');
    if (error) {
      toast.show({ message: friendlyError(error, 'Could not remove sample data. Try again.'), tone: 'error' });
      return;
    }
    await load();
    toast.show({
      message: `Removed ${removed.length} days of sample data.`,
      actionLabel: 'Undo',
      onAction: async () => {
        const { error: undoError } = await supabase.from('daily_metrics').upsert(removed, { onConflict: 'user_id,day,source' });
        if (undoError) toast.show({ message: 'Could not restore the sample data. Load it again instead.', tone: 'error' });
        await load();
      },
    });
  });

  const deleteEntry = async (row) => {
    const { error } = await supabase.from('daily_metrics').delete().eq('day', row.day).eq('source', 'manual');
    if (error) {
      toast.show({ message: friendlyError(error, `Could not delete ${formatDay(row.day)}. Try again.`), tone: 'error' });
      return;
    }
    await load();
    toast.show({
      message: `Deleted your entry for ${formatDay(row.day)}.`,
      actionLabel: 'Undo',
      onAction: async () => {
        const { updated_at: _ignored, ...restore } = row;
        const { error: undoError } = await supabase.from('daily_metrics').insert({ ...restore, user_id: user.id });
        if (undoError) toast.show({ message: `Could not restore ${formatDay(row.day)}. A new entry may already exist for that day.`, tone: 'error' });
        await load();
      },
    });
  };

  const reloadEntry = async (day) => {
    const { data } = await supabase.from('daily_metrics').select(`${METRIC_COLUMNS}, updated_at`).eq('day', day).eq('source', 'manual').maybeSingle();
    await load();
    return data;
  };

  const exportCsv = () => {
    const columns = [
      { key: 'day', label: 'Day' }, { key: 'source', label: 'Source' }, { key: 'revenue', label: `Revenue (${currency})` },
      { key: 'fees', label: 'Payment fees' }, { key: 'ad_spend', label: 'Ad spend' }, { key: 'organic_downloads', label: 'Organic downloads' },
      { key: 'paid_downloads', label: 'Downloads from ads' }, { key: 'purchases', label: 'Purchases' }, { key: 'active_users', label: 'Active users' },
    ];
    const firstDay = chartData[0].day;
    const inPeriod = (rows ?? []).filter((r) => r.day >= firstDay).sort((a, b) => a.day.localeCompare(b.day) || a.source.localeCompare(b.source));
    downloadCsv(`vibeassist-${firstDay}-to-${chartData[chartData.length - 1].day}.csv`, columns, inPeriod);
    toast.show({ message: `Exported ${inPeriod.length} rows for the last ${period} days.` });
  };

  const openEntry = (day) => setEntry({ day });

  if (rows === null) {
    return (
      <>
        <PageHeader title="Overview" description="Revenue, downloads and ad spend across every source." />
        <div className="stat-grid" aria-busy="true" aria-label="Loading your numbers">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" description="Revenue, downloads and ad spend across every source.">
        {!firstUse && (
          <>
            <div className="segmented" role="group" aria-label="Period">
              {PERIODS.map((p) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{p} days</button>
              ))}
            </div>
            <button type="button" className="btn btn-secondary" onClick={exportCsv}><Download aria-hidden="true" /> Export CSV</button>
            <button type="button" className="btn btn-primary" onClick={() => openEntry()} disabled={Boolean(entry)}>
              <Plus aria-hidden="true" /> Add a day
            </button>
          </>
        )}
      </PageHeader>

      {loadError && (
        <div className="section">
          <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>
            {loadError}
          </Notice>
        </div>
      )}

      {entry && (
        <div className="section">
          <MetricEntryForm
            key={entry.day ?? 'new'}
            userId={user.id}
            currency={currency}
            entries={manualEntries}
            initialDay={entry.day}
            onReload={reloadEntry}
            onCancel={() => setEntry(null)}
            onSaved={async (row, wasEdit) => {
              setEntry(null);
              toast.show({ message: `${wasEdit ? 'Updated' : 'Saved'} ${formatDay(row.day)}.` });
              await load();
            }}
          />
        </div>
      )}

      {firstUse && !entry && (
        <div className="card card--raised start-card">
          <h2>Get your first numbers in</h2>
          <p className="muted">Pick one way to start. You can add the others later.</p>
          <div className="start-options">
            <StartOption
              icon={PencilLine}
              title="Start from scratch"
              text="Type in yesterday's revenue, downloads and ad spend. Takes about a minute."
              action={<button type="button" className="btn btn-primary" onClick={() => openEntry()}>Add a day</button>}
            />
            <StartOption
              icon={Plug}
              title="Import from Stripe"
              text="Pull the last 90 days of revenue, refunds and fees with a read-only key."
              action={<Link className="btn btn-secondary" to="/data-sources">{hasPremium ? 'Connect Stripe' : 'See how (Premium)'}</Link>}
            />
            <StartOption
              icon={FlaskConical}
              title="Explore with sample data"
              text="60 days of made-up numbers, clearly marked, so you can try every screen. Remove them with one click."
              action={<button type="button" className="btn btn-secondary" onClick={loadSample} disabled={Boolean(busy)} aria-busy={busy === 'sample'}>{busy === 'sample' ? 'Adding…' : 'Load sample data'}</button>}
            />
          </div>
        </div>
      )}

      {!firstUse && (
        <>
          {hasSample && (
            <div className="section">
              <Notice
                tone="warning"
                title="Sample data is mixed in"
                actions={<button type="button" className="btn btn-secondary btn-sm" onClick={removeSample} disabled={Boolean(busy)}><Trash2 aria-hidden="true" /> {busy === 'remove-sample' ? 'Removing…' : 'Remove sample data'}</button>}
              >
                These numbers are made up so you can try the app. Your own entries and imports are kept when you remove them.
              </Notice>
            </div>
          )}

          <div className="continue-row section">
            <div className="continue-item">
              <p className="stat-label">Latest data</p>
              <p>{latestDay ? `${formatDay(latestDay)} (${relativeDay(latestDay)})` : `Nothing in the last ${period * 2} days`}</p>
              {latestDay && relativeDay(latestDay) !== 'today' && relativeDay(latestDay) !== 'yesterday' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEntry()}>Add the missing days</button>
              )}
            </div>
            {stripe && (
              <div className="continue-item">
                <p className="stat-label">Stripe · {stripe.account_label}</p>
                <p>{stripe.last_synced_at ? `Synced ${new Date(stripe.last_synced_at).toLocaleString()}` : 'Not synced yet'}</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={syncStripe} disabled={Boolean(busy)} aria-busy={busy === 'sync'}>
                  <RefreshCw aria-hidden="true" /> {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
            )}
            {hasPremium && (
              <div className="continue-item">
                <p className="stat-label">Weekly plan</p>
                {latestPlan && planSteps.length ? (
                  <p>{planDone} of {planSteps.length} steps done</p>
                ) : (
                  <p>{latestPlan ? 'Review the suggested steps' : 'No plan yet'}</p>
                )}
                <Link className="btn btn-ghost btn-sm" to="/plan"><ListChecks aria-hidden="true" /> {latestPlan ? 'Open plan' : 'Get a plan'} <ArrowRight aria-hidden="true" /></Link>
              </div>
            )}
          </div>

          <div className="stat-grid section">
            <Stat label={`Revenue · last ${period} days`} value={formatMoney(current.revenue, currency)} delta={change(current.revenue, previous.revenue)} periodDays={period} />
            <Stat label="Profit after fees and ads" value={formatMoney(profit, currency)} delta={previousProfit > 0 ? change(profit, previousProfit) : null} periodDays={period} />
            <Stat label="Downloads" value={formatCount(current.downloads)} delta={change(current.downloads, previous.downloads)} periodDays={period} />
            <Stat
              label="Conversion"
              value={conversion === null ? '—' : formatPercent(conversion)}
              delta={conversion !== null && previousConversion !== null ? change(conversion, previousConversion) : null}
              periodDays={period}
              hint={conversion === null ? 'Add purchases to see purchases per download' : undefined}
            />
          </div>

          <section className="card section" aria-labelledby="chart-title">
            <div className="section-header">
              <h2 id="chart-title">{chartMetric.label} per day</h2>
              <div className="segmented" role="group" aria-label="Chart metric">
                {CHART_METRICS.map((m) => (
                  <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>
                ))}
              </div>
            </div>
            <div style={{ height: 260 }} role="img" aria-label={`${chartMetric.label} per day for the last ${period} days. Exact numbers are in the CSV export.`}>
              <ResponsiveContainer width="100%" height="100%">
                {chartMetric.key === 'downloads' ? (
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#ECE7DE" />
                    <XAxis dataKey="label" tick={{ fill: '#79746C', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2DCD0' }} minTickGap={18} />
                    <YAxis tick={{ fill: '#79746C', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={formatCompactCount} width={48} />
                    <Tooltip cursor={{ fill: 'rgba(36,72,255,0.06)' }} formatter={(v, name) => [formatCount(v), name === 'paidDownloads' ? 'From ads' : 'Organic']} />
                    <Bar dataKey="organicDownloads" stackId="d" fill="#2448FF" name="organicDownloads" />
                    <Bar dataKey="paidDownloads" stackId="d" fill="#9DB0FF" radius={[3, 3, 0, 0]} name="paidDownloads" />
                  </BarChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2448FF" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#2448FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#ECE7DE" />
                    <XAxis dataKey="label" tick={{ fill: '#79746C', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#E2DCD0' }} minTickGap={18} />
                    <YAxis tick={{ fill: '#79746C', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompactMoney(v, currency)} width={56} />
                    <Tooltip formatter={(v) => [formatMoney(v, currency), chartMetric.label]} />
                    <Area type="monotone" dataKey={chartMetric.key} stroke="#2448FF" strokeWidth={2} fill="url(#chart-fill)" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
            <p className="field-help" style={{ marginTop: 8 }}>
              Sources: {sources.length ? sources.map((s) => SOURCE_LABELS[s]).join(', ') : 'none in this period'}.
              {latestActiveUsers !== null && ` Latest active users: ${formatCount(latestActiveUsers)}.`}
              {' '}Profit is revenue minus payment fees and ad spend.
            </p>
          </section>

          <section className="section" aria-labelledby="entries-title">
            <div className="section-header">
              <h2 id="entries-title">Days you entered by hand</h2>
              <span className="field-help">Stripe and Custom API days update on their own.</span>
            </div>
            {manualList.length === 0 ? (
              <div className="card"><p className="muted">No hand-entered days in the last {period * 2} days. Use “Add a day” for anything Stripe or your apps don't send.</p></div>
            ) : (
              <div className="card card--flush">
                <div className="table-wrap">
                  <table className="table table-stack">
                    <thead>
                      <tr>
                        <th scope="col">Day</th>
                        <th scope="col" className="num">Revenue</th>
                        <th scope="col" className="num">Ad spend</th>
                        <th scope="col" className="num">Downloads</th>
                        <th scope="col" className="num">Purchases</th>
                        <th scope="col" className="actions"><span className="visually-hidden">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualList.map((row) => (
                        <tr key={row.day}>
                          <td><strong>{formatDay(row.day, true)}</strong></td>
                          <td className="num" data-label="Revenue">{formatMoneyExact(row.revenue, currency)}</td>
                          <td className="num" data-label="Ad spend">{formatMoneyExact(row.ad_spend, currency)}</td>
                          <td className="num" data-label="Downloads">{formatCount(row.organic_downloads + row.paid_downloads)}</td>
                          <td className="num" data-label="Purchases">{formatCount(row.purchases)}</td>
                          <td className="actions">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEntry(row.day)}>Edit<span className="visually-hidden"> {formatDay(row.day)}</span></button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteEntry(row)}>Delete<span className="visually-hidden"> {formatDay(row.day)}</span></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
