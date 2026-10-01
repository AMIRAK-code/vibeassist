// Answer lists shared by the UI and the database. The database checks these exact values
// (supabase/migrations/*_plans_and_preferences.sql), so change both together.

export const GOALS = [
  'Grow revenue',
  'Get more downloads',
  'Spend less on ads',
  'Launch a new app',
  'Keep users coming back',
];

export const EXPERIENCE_OPTIONS = [
  { value: 'Beginner', label: 'New to shipping apps' },
  { value: 'Intermediate', label: 'Shipped a few apps' },
  { value: 'Pro', label: 'Full-time indie developer' },
];

// Stored values stay as they are; the labels say what they mean
export const PROFIT_OPTIONS = [
  { value: '$0 - $1,000', label: 'Up to $1,000 a month' },
  { value: '$1,000 - $10,000', label: '$1,000 to $10,000 a month' },
  { value: '$10k - $50k', label: '$10,000 to $50,000 a month' },
  { value: '$50k+', label: 'More than $50,000 a month' },
];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'INR', 'BRL', 'SEK'];

export const experienceLabel = (value) => EXPERIENCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
export const profitLabel = (value) => PROFIT_OPTIONS.find((o) => o.value === value)?.label ?? value;

export const AD_NETWORKS = {
  meta: { label: 'Meta (Facebook/Instagram)', short: 'Meta', color: '#0866FF' },
  google: { label: 'Google Ads', short: 'Google', color: '#1E8E3E' },
  youtube: { label: 'YouTube Ads', short: 'YouTube', color: '#D10000' },
  tiktok: { label: 'TikTok For Business', short: 'TikTok', color: '#111111' },
  x: { label: 'X (Twitter) Ads', short: 'X', color: '#111111' },
  apple_search: { label: 'Apple Search Ads', short: 'Apple', color: '#555566' },
};

export const CAMPAIGN_STATUSES = ['active', 'paused', 'ended'];

export const PLAN_FOCUSES = [
  { value: null, label: 'Whatever matters most' },
  { value: 'revenue', label: 'Revenue and pricing' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'ads', label: 'Ad spend' },
  { value: 'retention', label: 'Keeping users' },
];

export const PERIODS = [7, 30, 90];
