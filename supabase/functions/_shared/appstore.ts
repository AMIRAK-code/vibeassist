// App Store Connect: daily Sales and Trends summary reports, read with an API key the user
// creates in App Store Connect (Users and Access → Integrations → Team Keys, Sales role).
import { gunzip, parseDelimited, signJwt, StoreError } from './reports.ts';

export type AppStoreCredentials = { issuerId: string; keyId: string; privateKey: string };

export const APP_STORE_API = 'https://api.appstoreconnect.apple.com/v1/salesReports';

// Product types counted as a download of the app (first-time downloads, free or paid)
const APP_TYPES = new Set(['1', '1F', '1T', 'F1', '1-B', 'F1-B', '1E', '1EP', '1EU']);
// In-app purchases and subscriptions (IAC is a free subscription, so it isn't a purchase)
const PURCHASE_TYPES = new Set(['IA1', 'IA9', 'IAY', 'FI1', 'IA1-M', 'IA9-M', 'IAY-M']);
// Known types that are neither: updates, redownloads, restores, free subscriptions
const IGNORED_TYPES = new Set(['7', '7F', '7T', 'F7', '3', '3F', '3T', 'F3', 'IA3', 'FI3', 'IAC', 'IAC-M']);

export function appStoreToken(creds: AppStoreCredentials, nowSeconds = Math.floor(Date.now() / 1000)) {
  return signJwt('ES256', creds.privateKey, { kid: creds.keyId }, {
    iss: creds.issuerId,
    iat: nowSeconds,
    exp: nowSeconds + 19 * 60, // Apple allows at most 20 minutes
    aud: 'appstoreconnect-v1',
  });
}

export function salesReportUrl(vendorNumber: string, day: string) {
  const url = new URL(APP_STORE_API);
  url.searchParams.set('filter[frequency]', 'DAILY');
  url.searchParams.set('filter[reportType]', 'SALES');
  url.searchParams.set('filter[reportSubType]', 'SUMMARY');
  url.searchParams.set('filter[version]', '1_1');
  url.searchParams.set('filter[vendorNumber]', vendorNumber);
  url.searchParams.set('filter[reportDate]', day);
  return url;
}

// The day's report as text, or null when Apple has no report for that day
export async function fetchSalesDay(token: string, vendorNumber: string, day: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const res = await fetchFn(salesReportUrl(vendorNumber, day), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' },
  });
  if (res.ok) return new TextDecoder().decode(await gunzip(new Uint8Array(await res.arrayBuffer())));
  const body = await res.json().catch(() => ({}));
  const error = body?.errors?.[0] ?? {};
  if (res.status === 404 && (error.code === 'NOT_FOUND' || !error.code)) return null;
  throw new StoreError(res.status, error.code ?? '', error.detail ?? error.title ?? `App Store Connect returned ${res.status}`);
}

export type StoreDay = {
  downloads: number;
  purchases: number;
  proceeds: Map<string, number>; // currency of proceeds -> amount
};

// Adds up one Sales summary report by day. Refunds come as negative units and subtract.
export function parseSalesSummary(tsv: string) {
  const days = new Map<string, StoreDay>();
  const unknownTypes = new Set<string>();
  for (const row of parseDelimited(tsv, '\t')) {
    const type = row['Product Type Identifier'];
    const units = Number(row.Units) || 0;
    const proceeds = Number(row['Developer Proceeds']) || 0;
    const [month, date, year] = (row['Begin Date'] ?? '').split('/');
    if (!type || !year) continue;
    const day = `${year}-${month.padStart(2, '0')}-${date.padStart(2, '0')}`;
    const totals = days.get(day) ?? { downloads: 0, purchases: 0, proceeds: new Map() };
    if (APP_TYPES.has(type)) {
      if (units > 0) totals.downloads += units;
      if (units > 0 && proceeds > 0) totals.purchases += units; // a paid app download is a sale
    } else if (PURCHASE_TYPES.has(type)) {
      if (units > 0) totals.purchases += units;
    } else if (!IGNORED_TYPES.has(type)) {
      unknownTypes.add(type);
      continue;
    }
    if (proceeds !== 0 && units !== 0) {
      const currency = row['Currency of Proceeds'] || 'USD';
      totals.proceeds.set(currency, (totals.proceeds.get(currency) ?? 0) + units * proceeds);
    }
    days.set(day, totals);
  }
  return { days, unknownTypes };
}

export function explainAppleError(error: StoreError): string {
  if (error.status === 401) return 'App Store Connect rejected this key. Check the Issuer ID, Key ID and that the .p8 file is the one for this key.';
  if (error.status === 403) return 'This App Store Connect key cannot read sales reports. Create a Team key with the Sales (or Finance) role.';
  if (error.status === 429) return 'App Store Connect is rate limiting requests. Try again in a few minutes.';
  if (error.code === 'PARAMETER_ERROR.INVALID' || /vendor/i.test(error.message)) {
    return 'App Store Connect did not recognise that vendor number. Find it under Payments and Financial Reports.';
  }
  return `App Store Connect error: ${error.message}`;
}
