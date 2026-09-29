export const sampleMetrics = [
  { date: '2026-09-21', day: 'Mon', revenue: 4000, downloads: 2400 },
  { date: '2026-09-22', day: 'Tue', revenue: 3000, downloads: 1398 },
  { date: '2026-09-23', day: 'Wed', revenue: 2000, downloads: 9800 },
  { date: '2026-09-24', day: 'Thu', revenue: 2780, downloads: 3908 },
  { date: '2026-09-25', day: 'Fri', revenue: 1890, downloads: 4800 },
  { date: '2026-09-26', day: 'Sat', revenue: 2390, downloads: 3800 },
  { date: '2026-09-27', day: 'Sun', revenue: 3490, downloads: 4300 },
];
export function summarizeMetrics(rows) {
  return rows.reduce((totals, row) => ({ revenue: totals.revenue + row.revenue, downloads: totals.downloads + row.downloads }), { revenue: 0, downloads: 0 });
}
export function selectPeriod(rows, days) {
  return Number.isInteger(days) && days > 0 ? rows.slice(-days) : [];
}
export const formatMoney = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export const formatCount = value => new Intl.NumberFormat('en-US').format(value);
export const formatDate = value => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
