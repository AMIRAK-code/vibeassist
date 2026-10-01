import { supabase } from './supabase';

const pad = (n) => String(n).padStart(2, '0');

// Calendar day in the viewer's time zone, as stored in daily_metrics.day
export const isoDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const shortLabel = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);

// '2026-09-30' -> 'Sep 30' (parsed as a local calendar day, not UTC midnight)
export const formatDay = (iso, withYear = false) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }).format(new Date(y, m - 1, d));
};

// Whole calendar days between an ISO day and today
export const daysSince = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 864e5);
};

export const relativeDay = (iso) => {
  const n = daysSince(iso);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
};

export const METRIC_COLUMNS = 'day, source, revenue, fees, ad_spend, organic_downloads, paid_downloads, purchases, active_users';
export const SOURCE_LABELS = { manual: 'Entered by hand', sample: 'Sample data', stripe: 'Stripe', custom_api: 'Custom API' };

// All sources for the last `days` days; RLS limits the rows to the signed-in user
export function fetchMetrics(days) {
  return supabase
    .from('daily_metrics')
    .select(`${METRIC_COLUMNS}, updated_at`)
    .gte('day', isoDay(addDays(new Date(), -(days - 1))))
    .order('day');
}

const emptyDay = () => ({ revenue: 0, fees: 0, adSpend: 0, organicDownloads: 0, paidDownloads: 0, purchases: 0, activeUsers: null });

// Adds every source (Stripe, Custom API, manual, sample) into one total per day
function combineByDay(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const day = byDay.get(row.day) ?? emptyDay();
    day.revenue += Number(row.revenue);
    day.fees += Number(row.fees);
    day.adSpend += Number(row.ad_spend);
    day.organicDownloads += row.organic_downloads;
    day.paidDownloads += row.paid_downloads;
    day.purchases += row.purchases;
    if (row.active_users !== null) day.activeUsers = (day.activeUsers ?? 0) + row.active_users;
    byDay.set(row.day, day);
  }
  return byDay;
}

function totalsBetween(byDay, firstDay, lastDay) {
  const totals = { revenue: 0, fees: 0, adSpend: 0, downloads: 0, purchases: 0, daysWithData: 0 };
  for (const [day, t] of byDay) {
    if (day < firstDay || day > lastDay) continue;
    totals.revenue += t.revenue;
    totals.fees += t.fees;
    totals.adSpend += t.adSpend;
    totals.downloads += t.organicDownloads + t.paidDownloads;
    totals.purchases += t.purchases;
    totals.daysWithData++;
  }
  return totals;
}

// Chart rows for the current period plus totals for it and the period before
export function summarize(rows, periodDays) {
  const byDay = combineByDay(rows);
  const today = new Date();

  const chartData = [];
  for (let offset = periodDays - 1; offset >= 0; offset--) {
    const date = addDays(today, -offset);
    const t = byDay.get(isoDay(date)) ?? emptyDay();
    chartData.push({
      day: isoDay(date),
      label: shortLabel(date),
      ...t,
      downloads: t.organicDownloads + t.paidDownloads,
      profit: t.revenue - t.fees - t.adSpend,
      hasData: byDay.has(isoDay(date)),
    });
  }

  const current = totalsBetween(byDay, isoDay(addDays(today, -(periodDays - 1))), isoDay(today));
  const previous = totalsBetween(byDay, isoDay(addDays(today, -(2 * periodDays - 1))), isoDay(addDays(today, -periodDays)));
  const latestActiveUsers = [...byDay.entries()]
    .filter(([, t]) => t.activeUsers !== null)
    .sort(([a], [b]) => b.localeCompare(a))[0]?.[1].activeUsers ?? null;

  return {
    chartData,
    current,
    previous,
    latestActiveUsers,
    sources: [...new Set(rows.map((row) => row.source))],
  };
}

// Clearly labelled demo rows (source 'sample') so a new account can try the dashboard
export function buildSampleRows(userId, days = 60) {
  const today = new Date();
  const rows = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const i = days - 1 - offset;
    const wave = Math.sin(i / 3) * 0.15 + Math.sin(i / 7) * 0.1; // weekly-ish ups and downs
    const organic = Math.round((40 + i * 1.6) * (1 + wave));
    const paid = Math.round((15 + i * 0.6) * (1 - wave / 2));
    const purchases = Math.round((organic + paid) * 0.045);
    const revenue = Math.round(purchases * 9.99 * 100) / 100;
    rows.push({
      user_id: userId,
      day: isoDay(addDays(today, -offset)),
      source: 'sample',
      revenue,
      fees: Math.round(revenue * 0.029 * 100) / 100,
      ad_spend: Math.round(paid * 0.9 * 100) / 100,
      organic_downloads: organic,
      paid_downloads: paid,
      purchases,
      active_users: Math.round(300 + i * 12 * (1 + wave)),
    });
  }
  return rows;
}
