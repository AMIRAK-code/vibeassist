// Removes secrets from chat transcripts and handoffs before they're sent to an AI, saved or
// shared. Plain JavaScript with no Deno or npm imports: the web app cleans a chat before it
// leaves the browser, and the handoffs Edge Function cleans it again.
//
// The Pre-flight Scanner's patterns (engine/secret-patterns.json) only report where a secret is;
// here each match is replaced in place with "[removed: …]". Chats also carry things code rarely
// does (bearer tokens, connection strings, .env lines), so those patterns live in this file and
// the shared JSON stays identical to the GitHub Action's copy.
import catalog from '../engine/secret-patterns.json' with { type: 'json' };

// Example values people paste on purpose: left alone, like the Pre-flight Scanner does
const PLACEHOLDER = /(x{6,}|\*{4,}|example|placeholder|your[_-]?(key|token|secret|password)|changeme|<[^>]+>|\$\{|^\[removed)/i;

// Shannon entropy in bits per character: random keys score high, words and placeholders low
export function entropy(text) {
  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

const marker = (label) => `[removed: ${label}]`;

// Handled by the special rules below instead: the catalog versions match only a key's name or header
const SPECIAL = new Set(['private_key', 'client_secret_env', 'generic_secret']);
const CATALOG = catalog.patterns
  .filter((p) => !SPECIAL.has(p.id))
  .map((p) => ({ id: p.id, label: p.title, re: new RegExp(p.regex, `g${p.flags ?? ''}`) }));

// Secrets that turn up in chats more than in code
const EXTRA = [
  { id: 'stripe_test', label: 'Stripe test key', re: /\b(sk|rk)_test_[A-Za-z0-9]{20,}/g },
  { id: 'stripe_webhook', label: 'Stripe webhook secret', re: /\bwhsec_[A-Za-z0-9+/=]{20,}/g },
  { id: 'supabase_secret', label: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g },
  { id: 'groq_key', label: 'Groq API key', re: /\bgsk_[A-Za-z0-9]{30,}/g },
  { id: 'xai_key', label: 'xAI API key', re: /\bxai-[A-Za-z0-9]{30,}/g },
  { id: 'huggingface_token', label: 'Hugging Face token', re: /\bhf_[A-Za-z0-9]{30,}/g },
  { id: 'resend_key', label: 'Resend API key', re: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}/g },
];

const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----|(?:\s*[A-Za-z0-9+/=]{16,})*)/g;
// Any JWT, not only Supabase service-role keys: session tokens get pasted into chats too
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const BEARER = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{20,})/g;
// postgres://user:password@host -> only the password goes
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]+)(@)/gi;
// password = "…", api_key: '…': only the quoted value goes, so the line still reads
const QUOTED_SECRET = /\b(password|passwd|pwd|secret|api_key|apikey|access_token|auth_token|client_secret)\b(\s*[:=]\s*)(['"])([^'"\s]{8,})\3/gi;
// .env style lines: SOMETHING_KEY=value, export SOMETHING_TOKEN="value"
const ENV_LINE = /^(\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|PRIVATE|CREDENTIALS?|DSN|DATABASE_URL|SERVICE_ROLE)[A-Z0-9_]*\s*[=:]\s*)(['"]?)([^\s'"#]{6,})\2/gm;

// Returns the cleaned text and how many of each kind were removed
export function redactText(input) {
  let text = String(input ?? '');
  const removed = {};
  // Counts one removal and returns the marker that takes its place
  const swap = (id, label) => {
    removed[id] = (removed[id] ?? 0) + 1;
    return marker(label);
  };
  const keep = (value) => PLACEHOLDER.test(value);

  text = text.replace(PEM, () => swap('private_key', 'private key'));
  text = text.replace(JWT, (match) => (keep(match) ? match : swap('jwt', 'token')));
  for (const p of [...CATALOG, ...EXTRA]) {
    p.re.lastIndex = 0;
    text = text.replace(p.re, (match) => (keep(match) ? match : swap(p.id, p.label)));
  }
  text = text.replace(BEARER, (match, prefix, token) => (keep(token) ? match : prefix + swap('bearer_token', 'token')));
  text = text.replace(URL_PASSWORD, (match, start, password, at) => (keep(password) ? match : start + swap('url_password', 'password') + at));
  text = text.replace(QUOTED_SECRET, (match, name, sep, quote, value) =>
    (keep(value) || entropy(value) < 3 ? match : name + sep + quote + swap('password', 'secret') + quote));
  text = text.replace(ENV_LINE, (match, start, quote, value) =>
    (keep(value) || /^(true|false|null|none|\d+)$/i.test(value) || entropy(value) < 3 ? match : start + quote + swap('env_secret', 'secret') + quote));

  return { text, removed, total: Object.values(removed).reduce((a, b) => a + b, 0) };
}

// "2 keys and 1 password" style summary for the page
export function describeRemoved(removed) {
  const total = Object.values(removed ?? {}).reduce((a, b) => a + b, 0);
  if (!total) return 'No keys or passwords found';
  return `${total} ${total === 1 ? 'key or password' : 'keys or passwords'} removed`;
}
