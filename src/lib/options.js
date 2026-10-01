// Answer lists shared by the UI and the database. The database checks these exact
// values (supabase/migrations/20261001150000_vibeassist_schema.sql), so change both together.

export const GOALS = [
  'Build a SaaS Empire',
  'Develop Viral Mobile Games',
  'Generate Passive Income',
  'Automate Workflows with AI',
  'Freelance App Development',
  'Sell Micro-tools',
];

export const EXPERIENCE_OPTIONS = [
  { value: 'Beginner', label: 'Beginner (Vibe Coder)' },
  { value: 'Intermediate', label: 'Intermediate (Some apps built)' },
  { value: 'Pro', label: 'Pro (Full time indie)' },
];

export const PROFIT_OPTIONS = ['$0 - $1,000', '$1,000 - $10,000', '$10k - $50k', '$50k+'];

export const AD_NETWORKS = {
  meta: { label: 'Meta (Facebook/Instagram)', short: 'f', color: '#0866FF' },
  google: { label: 'Google Ads', short: 'G', color: '#34A853' },
  youtube: { label: 'YouTube Ads', short: 'YT', color: '#FF0000' },
  tiktok: { label: 'TikTok For Business', short: 'TT', color: '#000000' },
  x: { label: 'X.com (Twitter) Ads', short: 'X', color: '#111111' },
  apple_search: { label: 'Apple Search Ads', short: 'A', color: '#555566' },
};

export const CAMPAIGN_STATUSES = ['active', 'paused', 'ended'];
