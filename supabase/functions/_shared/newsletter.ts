// The Weekly Vibe email: this week's top community threads and AI news, plus (if the subscriber
// chose it) their own numbers for last week. Plain table HTML with inline styles for email
// clients, a plain-text twin, and no tracking pixels or tracked links.
import type { FeedItem } from './feeds.ts';

export type Totals = { revenue: number; fees: number; ad_spend: number; downloads: number; days: number };
export type Payload = {
  include_numbers: boolean;
  unsubscribe_token: string;
  name?: string | null;
  currency?: string;
  current?: Totals;
  previous?: Totals;
};
export type IssueContent = { week_start: string; threads: FeedItem[]; news: FeedItem[] };
export type Links = { site: string; unsubscribe: string; manage: string; privacy: string };
export type Business = { name: string; address: string; email: string };

export { CONSENT_TEXT } from './consent.js';

const escape = (text: unknown) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const weekLabel = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

// "+12% vs the week before", or nothing when there's no earlier week to compare with
function change(current: number, previous: number) {
  if (!(previous > 0)) return '';
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs the week before`;
}

export function numbersRows(payload: Payload) {
  if (!payload.include_numbers || !payload.current) return null;
  const currency = payload.currency ?? 'USD';
  const c = payload.current;
  const p = payload.previous ?? { revenue: 0, fees: 0, ad_spend: 0, downloads: 0, days: 0 };
  if (!c.days) return [];
  const profit = c.revenue - c.fees - c.ad_spend;
  const previousProfit = p.revenue - p.fees - p.ad_spend;
  return [
    { label: 'Revenue', value: money(c.revenue, currency), change: change(c.revenue, p.revenue) },
    { label: 'Profit after fees and ads', value: money(profit, currency), change: change(profit, previousProfit) },
    { label: 'Downloads', value: new Intl.NumberFormat('en-US').format(c.downloads), change: change(c.downloads, p.downloads) },
  ];
}

function linkList(items: FeedItem[]) {
  return items.map((item) => `
    <tr><td style="padding:8px 0;border-top:1px solid #ECE7DE">
      <a href="${escape(item.url)}" style="color:#171717;font-weight:600;text-decoration:none">${escape(item.title)}</a>
      <div style="color:#66625B;font-size:13px;margin-top:2px">${escape(item.community)} · ${item.points} points ·
        <a href="${escape(item.comments_url)}" style="color:#2448FF">${item.comments} comments</a></div>
    </td></tr>`).join('');
}

const textList = (items: FeedItem[]) => items.map((i) => `- ${i.title} (${i.community})\n  ${i.url}`).join('\n');

export function renderDigest(issue: IssueContent, payload: Payload, email: string, links: Links, business: Business) {
  const week = weekLabel(issue.week_start);
  const subject = `The Weekly Vibe · ${week}`;
  const greeting = payload.name ? `Hi ${payload.name.split(' ')[0]},` : 'Hi,';
  const rows = numbersRows(payload);
  const threads = issue.threads.slice(0, 5);
  const news = issue.news.slice(0, 5);

  const numbersHtml = rows === null ? '' : rows.length === 0
    ? `<p style="margin:0 0 20px">No numbers for last week yet. <a href="${escape(links.site)}/dashboard" style="color:#2448FF">Add them on Overall Income →</a></p>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #ECE7DE;border-radius:10px">
        ${rows.map((r) => `<tr><td style="padding:10px 14px;color:#66625B">${escape(r.label)}</td>
          <td style="padding:10px 14px;text-align:right"><strong>${escape(r.value)}</strong><div style="font-size:12px;color:#66625B">${escape(r.change)}</div></td></tr>`).join('')}
      </table>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#F5F1E8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFDFA;border-radius:14px;padding:28px">
<tr><td>
  <p style="margin:0 0 4px;color:#2448FF;font-weight:700;font-size:13px;letter-spacing:.04em;text-transform:uppercase">The Weekly Vibe</p>
  <h1 style="margin:0 0 16px;font-size:22px">Week of ${escape(week)}</h1>
  <p style="margin:0 0 20px">${escape(greeting)} here's what indie app makers talked about this week${rows ? ', and how your last week went' : ''}.</p>
  ${rows ? `<h2 style="font-size:16px;margin:0 0 8px">Your last week</h2>${numbersHtml}` : ''}
  ${threads.length ? `<h2 style="font-size:16px;margin:0 0 4px">Trending community threads</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${linkList(threads)}</table>` : ''}
  ${news.length ? `<h2 style="font-size:16px;margin:0 0 4px">AI news</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${linkList(news)}</table>` : ''}
  <p style="margin:24px 0 0;font-size:12px;color:#66625B;line-height:1.5">
    You're getting this because you subscribed to the Weekly Vibe in VibeAssist with ${escape(email)}.
    <a href="${escape(links.manage)}" style="color:#66625B">Manage it in Settings</a> ·
    <a href="${escape(links.unsubscribe)}" style="color:#66625B">Unsubscribe</a> ·
    <a href="${escape(links.privacy)}" style="color:#66625B">Privacy</a><br>
    ${escape(business.name)} · ${escape(business.address)} · ${escape(business.email)}
  </p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    `THE WEEKLY VIBE · Week of ${week}`,
    '',
    `${greeting} here's what indie app makers talked about this week${rows ? ', and how your last week went' : ''}.`,
    ...(rows === null ? [] : rows.length === 0
      ? ['', `No numbers for last week yet. Add them on Overall Income: ${links.site}/dashboard`]
      : ['', 'YOUR LAST WEEK', ...rows.map((r) => `${r.label}: ${r.value}${r.change ? ` (${r.change})` : ''}`)]),
    ...(threads.length ? ['', 'TRENDING COMMUNITY THREADS', textList(threads)] : []),
    ...(news.length ? ['', 'AI NEWS', textList(news)] : []),
    '',
    '--',
    `You're getting this because you subscribed to the Weekly Vibe in VibeAssist with ${email}.`,
    `Manage: ${links.manage}`,
    `Unsubscribe: ${links.unsubscribe}`,
    `Privacy: ${links.privacy}`,
    `${business.name} · ${business.address} · ${business.email}`,
  ].join('\n');

  return { subject, html, text };
}

export function renderConfirm(confirmUrl: string, email: string, business: Business) {
  const subject = 'Confirm your Weekly Vibe subscription';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#F5F1E8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFDFA;border-radius:14px;padding:28px"><tr><td>
  <h1 style="margin:0 0 12px;font-size:20px">Confirm your subscription</h1>
  <p style="margin:0 0 20px">Press the button to start getting the Weekly Vibe at ${escape(email)} every Monday. If you didn't ask for it, ignore this email and nothing will be sent.</p>
  <p style="margin:0 0 24px"><a href="${escape(confirmUrl)}" style="display:inline-block;background:#2448FF;color:#FFFFFF;padding:12px 18px;border-radius:10px;font-weight:600;text-decoration:none">Confirm subscription</a></p>
  <p style="margin:0;font-size:12px;color:#66625B">The link works for 7 days. ${escape(business.name)} · ${escape(business.address)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `Confirm your Weekly Vibe subscription\n\nOpen this link to start getting the Weekly Vibe at ${email} every Monday:\n${confirmUrl}\n\nIf you didn't ask for it, ignore this email and nothing will be sent. The link works for 7 days.\n\n${business.name} · ${business.address}`;
  return { subject, html, text };
}

// The Monday (in Rome) of the week a run happens in, as YYYY-MM-DD
export function weekStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const local = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`);
  const offset = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 7) % 7;
  return new Date(local.getTime() - offset * 864e5).toISOString().slice(0, 10);
}
