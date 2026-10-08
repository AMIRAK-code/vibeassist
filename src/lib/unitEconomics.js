// Growth and pricing figures worked out directly from the user's own numbers (no AI).
// Every figure is null when the data it needs is missing, with a note saying what to add.

const sum = (days, key) => days.reduce((total, d) => total + (d[key] ?? 0), 0);

// chartData rows from summarize(); periodDays is how many days they cover.
// churnPct is the user's own estimate of monthly churn, in percent, or null.
export function unitEconomics(chartData, periodDays, churnPct = null) {
  const revenue = sum(chartData, 'revenue');
  const fees = sum(chartData, 'fees');
  const adSpend = sum(chartData, 'adSpend');
  const paid = sum(chartData, 'paidDownloads');
  const downloads = sum(chartData, 'downloads');
  const usersDays = chartData.filter((d) => d.activeUsers !== null && d.activeUsers !== undefined);
  const avgUsers = usersDays.length ? sum(usersDays, 'activeUsers') / usersDays.length : null;

  const missing = [];
  const cac = adSpend > 0 && paid > 0 ? adSpend / paid : null;
  if (cac === null) missing.push(adSpend > 0 ? 'downloads from ads' : 'ad spend');

  // Revenue after payment fees, per active user, scaled to a 30-day month
  const arpuMonthly = avgUsers > 0 ? ((revenue - fees) / avgUsers) * (30 / periodDays) : null;
  if (arpuMonthly === null) missing.push('active users');

  const revenuePerDownload = downloads > 0 ? revenue / downloads : null;
  const paybackMonths = cac !== null && arpuMonthly > 0 ? cac / arpuMonthly : null;

  const churn = Number(churnPct) > 0 && Number(churnPct) <= 100 ? Number(churnPct) / 100 : null;
  if (churn === null) missing.push('your monthly churn estimate');
  const ltv = arpuMonthly !== null && churn !== null ? arpuMonthly / churn : null;
  const ltvToCac = ltv !== null && cac > 0 ? ltv / cac : null;

  return { cac, arpuMonthly, revenuePerDownload, paybackMonths, ltv, ltvToCac, missing };
}

// Splits the days into weeks (newest week last) and reports revenue per purchase for each:
// the closest thing to "price" the data has. When it moved by more than `threshold`
// between two weeks next to each other, estimates the arc elasticity of purchases.
export function priceSignal(chartData, threshold = 0.1) {
  const weeks = [];
  for (let end = chartData.length; end - 7 >= 0; end -= 7) {
    const days = chartData.slice(end - 7, end);
    const purchases = sum(days, 'purchases');
    const revenue = sum(days, 'revenue');
    weeks.unshift({ start: days[0].day, purchases, revenue, price: purchases > 0 ? revenue / purchases : null });
  }

  let latestChange = null;
  for (let i = 1; i < weeks.length; i++) {
    const before = weeks[i - 1];
    const after = weeks[i];
    if (before.price === null || after.price === null) continue;
    const priceMove = (after.price - before.price) / ((after.price + before.price) / 2);
    if (Math.abs(priceMove) <= threshold) continue;
    const quantityMove = (after.purchases - before.purchases) / ((after.purchases + before.purchases) / 2);
    latestChange = { before, after, elasticity: quantityMove / priceMove };
  }
  return { weeks, change: latestChange };
}
