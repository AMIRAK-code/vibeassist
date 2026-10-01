export const formatMoney = (value, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
export const formatMoneyExact = (value, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
export const formatCount = (value) => new Intl.NumberFormat('en-US').format(value);
export const formatCompactMoney = (value, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact' }).format(value);
export const formatCompactCount = (value) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
export const formatPercent = (value) => `${value.toFixed(1)}%`;
export const formatGrowth = (percent) => `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
export const formatDateTime = (iso) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
