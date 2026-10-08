// The Legal Document Generator's answers, checks and exports. The draft itself is written by
// the legal-docs Edge Function; everything here runs in the browser.

export const DOC_KINDS = [
  { value: 'privacy', label: 'Privacy Policy' },
  { value: 'terms', label: 'Terms of Service' },
  { value: 'eula', label: 'EULA' },
];
export const kindLabel = (kind) => DOC_KINDS.find((k) => k.value === kind)?.label ?? kind;

export const PLATFORM_OPTIONS = [
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'web', label: 'Web' },
  { value: 'windows', label: 'Windows' },
  { value: 'mac', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
];

export const DATA_OPTIONS = [
  { value: 'email', label: 'Email address' },
  { value: 'name', label: 'Name' },
  { value: 'account', label: 'Account login' },
  { value: 'payments', label: 'Payment details (via a payment provider)' },
  { value: 'usage', label: 'Usage analytics' },
  { value: 'crash', label: 'Crash reports and diagnostics' },
  { value: 'device', label: 'Device identifiers' },
  { value: 'advertising_id', label: 'Advertising identifier' },
  { value: 'location', label: 'Location' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'photos', label: 'Photos or files' },
  { value: 'health', label: 'Health or fitness data' },
  { value: 'user_content', label: 'Content users create' },
];

export const SERVICE_OPTIONS = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'revenuecat', label: 'RevenueCat' },
  { value: 'firebase', label: 'Firebase / Google Analytics' },
  { value: 'supabase', label: 'Supabase' },
  { value: 'admob', label: 'Google AdMob' },
  { value: 'meta_sdk', label: 'Meta SDK' },
  { value: 'sentry', label: 'Sentry' },
  { value: 'mixpanel', label: 'Mixpanel / Amplitude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'aws', label: 'AWS' },
  { value: 'vercel', label: 'Vercel / Cloudflare' },
];

export const MONETIZATION_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'ads', label: 'Ads' },
  { value: 'iap', label: 'In-app purchases' },
  { value: 'subscription', label: 'Subscriptions' },
  { value: 'paid', label: 'Paid upfront' },
];

export const EMPTY_INPUTS = {
  appName: '', developerName: '', contactEmail: '', country: '', website: '',
  platforms: [], data: [], services: [], otherServices: '', monetization: [],
  children: false, accountDeletion: '', effectiveDate: '',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Field -> message for anything that needs fixing before a draft is worth asking for
export function validateInputs(inputs) {
  const errors = {};
  if (!inputs.appName.trim()) errors.appName = 'Name the app.';
  else if (inputs.appName.trim().length > 80) errors.appName = 'Keep it under 80 characters.';
  if (!inputs.developerName.trim()) errors.developerName = 'Who publishes it: your full name or your company.';
  if (!EMAIL.test(inputs.contactEmail.trim())) errors.contactEmail = 'An email address people can write to about the app.';
  if (!inputs.country.trim()) errors.country = 'The country you (or your company) are based in.';
  if (inputs.website.trim() && !/^https?:\/\/\S+\.\S+/.test(inputs.website.trim())) errors.website = 'Start with https://';
  if (!inputs.platforms.length) errors.platforms = 'Pick at least one platform.';
  if (!inputs.monetization.length) errors.monetization = 'Pick at least one.';
  if (inputs.otherServices.length > 200) errors.otherServices = 'Keep it under 200 characters.';
  if (inputs.accountDeletion.length > 300) errors.accountDeletion = 'Keep it under 300 characters.';
  return errors;
}

// A section body is plain text: paragraphs separated by blank lines, list items starting "- "
export function bodyBlocks(body) {
  const blocks = [];
  for (const chunk of String(body ?? '').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^[-•*]\s+/.test(l))) {
      blocks.push({ type: 'ul', items: lines.map((l) => l.replace(/^[-•*]\s+/, '')) });
    } else {
      blocks.push({ type: 'p', text: lines.join(' ') });
    }
  }
  return blocks;
}

export function toPlainText(doc) {
  return [doc.title, '', ...doc.sections.flatMap((s) => [s.heading, '', s.body.trim(), ''])].join('\n').trim();
}

export function toMarkdown(doc) {
  return [`# ${doc.title}`, '', ...doc.sections.flatMap((s) => [`## ${s.heading}`, '', s.body.trim(), ''])].join('\n').trim() + '\n';
}

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toHtml(doc) {
  const body = doc.sections.map((s) => {
    const blocks = bodyBlocks(s.body).map((b) => (b.type === 'ul'
      ? `<ul>${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
      : `<p>${escapeHtml(b.text)}</p>`)).join('\n');
    return `<h2>${escapeHtml(s.heading)}</h2>\n${blocks}`;
  }).join('\n');
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(doc.title)}</title>\n<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.6;color:#171717}h2{margin-top:2em}</style>\n</head>\n<body>\n<h1>${escapeHtml(doc.title)}</h1>\n${body}\n</body>\n</html>\n`;
}

// "privacy-policy-my-app.md"
export function fileName(doc, extension) {
  const slug = `${kindLabel(doc.kind)} ${doc.inputs?.appName ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'document'}.${extension}`;
}

export function countPlaceholders(doc) {
  return doc.sections.reduce((n, s) => n + (s.body.match(/\[[^\]]+\]/g)?.length ?? 0), 0);
}
