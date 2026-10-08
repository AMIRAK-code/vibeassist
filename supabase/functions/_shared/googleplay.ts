// Google Play Console: the monthly reports Play writes to the developer account's Cloud
// Storage bucket, read with a service account the user invites in Play Console
// (Users and permissions → View app information and download bulk reports, View financial data).
import { decodeText, parseDelimited, signJwt, StoreError, unzipEntries } from './reports.ts';

export type ServiceAccount = { client_email: string; private_key: string; token_uri: string };

const STORAGE = 'https://storage.googleapis.com/storage/v1/b';
const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';

// Keeps only what's needed to sign in, so the rest of the key file is never stored
export function parseServiceAccount(text: string): ServiceAccount {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StoreError(400, 'bad_key', 'That file is not a service account key. Download the JSON key from Google Cloud and upload it here.');
  }
  const { client_email, private_key, token_uri, type } = parsed as Record<string, string>;
  if (type !== 'service_account' || !client_email || !private_key?.includes('PRIVATE KEY')) {
    throw new StoreError(400, 'bad_key', 'That JSON file is not a service account key. In Google Cloud, open the service account → Keys → Add key → JSON.');
  }
  return { client_email, private_key, token_uri: token_uri || 'https://oauth2.googleapis.com/token' };
}

// "gs://pubsite_prod_rev_123/" or "pubsite_prod_123" -> "pubsite_prod_rev_123"
export function normaliseBucket(uri: string) {
  return uri.trim().replace(/^gs:\/\//, '').replace(/\/.*$/, '');
}

export async function googleAccessToken(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000), fetchFn: typeof fetch = fetch) {
  const assertion = await signJwt('RS256', account.private_key, {}, {
    iss: account.client_email,
    scope: SCOPE,
    aud: account.token_uri,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });
  const res = await fetchFn(account.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new StoreError(res.status, body.error ?? '', body.error_description ?? `Google sign-in returned ${res.status}`);
  return body.access_token as string;
}

export async function listObjects(token: string, bucket: string, prefix: string, fetchFn: typeof fetch = fetch): Promise<string[]> {
  const names: string[] = [];
  let pageToken = '';
  do {
    const url = new URL(`${STORAGE}/${encodeURIComponent(bucket)}/o`);
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('fields', 'items(name),nextPageToken');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new StoreError(res.status, body?.error?.status ?? '', body?.error?.message ?? `Cloud Storage returned ${res.status}`);
    for (const item of body.items ?? []) names.push(item.name);
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return names;
}

// The object's bytes, or null when it doesn't exist (for example a month with no sales)
export async function downloadObject(token: string, bucket: string, name: string, fetchFn: typeof fetch = fetch): Promise<Uint8Array | null> {
  const res = await fetchFn(`${STORAGE}/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new StoreError(res.status, body?.error?.status ?? '', body?.error?.message ?? `Cloud Storage returned ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export function packagesFromObjectNames(names: string[]) {
  const packages = new Set<string>();
  for (const name of names) {
    const match = /^stats\/installs\/installs_(.+)_\d{6}_overview\.csv$/.exec(name);
    if (match) packages.add(match[1]);
  }
  return [...packages].sort();
}

// "Daily User Installs" when Play fills it in, otherwise "Install events"
export function parseInstallsOverview(bytes: Uint8Array) {
  const rows = parseDelimited(decodeText(bytes), ',');
  const column = rows.some((r) => r['Daily User Installs'] !== undefined && r['Daily User Installs'] !== '')
    ? 'Daily User Installs'
    : 'Install events';
  const days = new Map<string, number>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.Date ?? '')) continue;
    days.set(row.Date, (days.get(row.Date) ?? 0) + Math.max(0, Number(row[column]) || 0));
  }
  return { days, column };
}

export type PlayDay = { purchases: number; sales: Map<string, number> }; // currency of sale -> item price total

// Orders by the day they were charged. Refunded orders subtract; other statuses are ignored.
export async function parseSalesReport(zip: Uint8Array, packages: string[]) {
  const days = new Map<string, PlayDay>();
  for (const entry of await unzipEntries(zip)) {
    if (!entry.name.endsWith('.csv')) continue;
    for (const row of parseDelimited(decodeText(entry.data), ',')) {
      if (packages.length && !packages.includes(row['Product ID'])) continue;
      const day = row['Order Charged Date'];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) continue;
      const status = (row['Financial Status'] ?? '').toLowerCase();
      const refund = status.includes('refund');
      if (!refund && status !== 'charged') continue;
      const price = Math.abs(Number(String(row['Item Price']).replace(/,/g, '')) || 0);
      const currency = row['Currency of Sale'] || 'USD';
      const totals = days.get(day) ?? { purchases: 0, sales: new Map() };
      totals.sales.set(currency, (totals.sales.get(currency) ?? 0) + (refund ? -price : price));
      if (!refund) totals.purchases++;
      days.set(day, totals);
    }
  }
  return days;
}

// 'YYYYMM' for this month and the `count - 1` months before it
export function recentMonths(count: number, now = new Date()) {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export function explainGoogleError(error: StoreError): string {
  if (error.code === 'invalid_grant') return 'Google rejected this service account key. It may have been deleted; create a new JSON key and upload it.';
  if (error.status === 401) return 'Google could not sign in with this service account. Upload a fresh JSON key.';
  if (error.status === 403) return 'The service account cannot read your Play reports yet. In Play Console → Users and permissions, invite its email with "View app information and download bulk reports" and "View financial data". New permissions can take up to 24 hours to work.';
  if (error.status === 404) return 'That Cloud Storage bucket was not found. Copy the URI from Play Console → Download reports (it starts with gs://pubsite_prod_).';
  if (error.status === 429) return 'Google is rate limiting requests. Try again in a few minutes.';
  return `Google Play error: ${error.message}`;
}
