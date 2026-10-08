// Imports daily downloads, purchases and revenue from App Store Connect or Google Play into
// daily_metrics (source 'app_store' / 'google_play'), with credentials the user pastes once.
//
// POST { provider: 'app_store' | 'google_play', action: 'connect', credentials: {...} }
//   app_store:   { issuerId, keyId, privateKey (.p8 contents), vendorNumber }
//   google_play: { serviceAccount (JSON key file contents), bucket (gs://pubsite_prod_…), packages?, feeRate? }
// POST { provider, action: 'sync' }        -> imports the last 90 days (then picks up where it left off)
// POST { provider, action: 'disconnect' }  -> forgets the credentials; imported days stay
//
// Credentials are stored encrypted in Supabase Vault and never returned to the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { json, corsHeaders, projectKey } from '../_shared/http.ts';
import { daysBetween, mapLimit, StoreError } from '../_shared/reports.ts';
import { convert, fetchEcbRates, type Rates } from '../_shared/fx.ts';
import { appStoreToken, explainAppleError, fetchSalesDay, parseSalesSummary, type AppStoreCredentials } from '../_shared/appstore.ts';
import {
  downloadObject, explainGoogleError, googleAccessToken, listObjects, normaliseBucket, packagesFromObjectNames,
  parseInstallsOverview, parseSalesReport, parseServiceAccount, recentMonths, type ServiceAccount,
} from '../_shared/googleplay.ts';

type Provider = 'app_store' | 'google_play';
const LABELS: Record<Provider, string> = { app_store: 'App Store Connect', google_play: 'Google Play' };
const BACKFILL_DAYS = 90;
const OVERLAP_DAYS = 6; // stores revise recent days, so each sync re-reads the last week
const BUDGET_MS = 100_000; // stay well inside the Edge Function time limit
const MAX_REPORT_BYTES = 25 * 1024 * 1024;

type Settings = {
  vendor_number?: string;
  bucket?: string;
  packages?: string[];
  fee_rate?: number;
  client_email?: string;
  synced_through?: string;
  currency?: string;
};
type MetricRow = { day: string; revenue: number; fees: number; organic_downloads: number; purchases: number };
type SyncResult = {
  rows: MetricRow[];
  fetchedDays: string[];
  syncedThrough: string | null;
  failedDays: number;
  skippedCurrencies: string[];
  notes: string[];
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 864e5));
const round = (n: number) => Math.round(n * 100) / 100;

// Where to start: 90 days back the first time (or after a currency change), otherwise a week
// before the last day that was fully imported
function windowStart(settings: Settings, currency: string) {
  const earliest = daysAgo(BACKFILL_DAYS);
  if (!settings.synced_through || settings.currency !== currency) return earliest;
  const resume = isoDay(new Date(new Date(`${settings.synced_through}T00:00:00Z`).getTime() - OVERLAP_DAYS * 864e5));
  return resume > earliest ? resume : earliest;
}

// Turns per-currency amounts into the user's currency; unknown currencies are reported, not guessed
async function converter(currency: string) {
  let rates: Rates | null = null;
  const skipped = new Set<string>();
  return {
    skipped,
    async toProfile(amounts: Map<string, number>, day: string) {
      let total = 0;
      for (const [from, amount] of amounts) {
        if (from === currency) {
          total += amount;
          continue;
        }
        rates = rates ?? await fetchEcbRates();
        const converted = convert(amount, from, currency, day, rates);
        if (converted === null) skipped.add(from);
        else total += converted;
      }
      return total;
    },
  };
}

async function syncAppStore(creds: AppStoreCredentials, settings: Settings, currency: string, deadline: number): Promise<SyncResult> {
  const token = await appStoreToken(creds);
  const days = daysBetween(windowStart(settings, currency), daysAgo(1));
  const results = await mapLimit(days, 4, (day) => fetchSalesDay(token, settings.vendor_number!, day), deadline);

  // A stopped key fails every day the same way: report that instead of 90 failed days
  const authFailure = results.find((r) => !r.ok && 'error' in r && r.error instanceof StoreError && [401, 403].includes(r.error.status));
  if (authFailure && !authFailure.ok && 'error' in authFailure) throw authFailure.error;

  const money = await converter(currency);
  const rows: MetricRow[] = [];
  const fetchedDays: string[] = [];
  const unknownTypes = new Set<string>();
  let syncedThrough: string | null = null;
  let contiguous = true;
  let failedDays = 0;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const result = results[i];
    // Apple publishes a day's report the following day; missing recent days aren't "no sales" yet
    const tooRecent = day >= daysAgo(2);
    if (!result.ok || (result.value === null && tooRecent)) {
      if (!result.ok) failedDays++;
      contiguous = false;
      continue;
    }
    fetchedDays.push(day);
    if (contiguous) syncedThrough = day;
    if (result.value === null) continue; // no sales that day
    const parsed = parseSalesSummary(result.value);
    parsed.unknownTypes.forEach((t) => unknownTypes.add(t));
    const totals = parsed.days.get(day);
    if (!totals) continue;
    rows.push({
      day,
      revenue: round(await money.toProfile(totals.proceeds, day)),
      fees: 0, // Apple reports proceeds after its commission
      organic_downloads: totals.downloads,
      purchases: totals.purchases,
    });
  }
  const notes = unknownTypes.size ? [`Some product types weren't counted: ${[...unknownTypes].join(', ')}`] : [];
  return { rows, fetchedDays, syncedThrough, failedDays, skippedCurrencies: [...money.skipped], notes };
}

async function syncGooglePlay(account: ServiceAccount, settings: Settings, currency: string, deadline: number): Promise<SyncResult> {
  const token = await googleAccessToken(account);
  const bucket = settings.bucket!;
  const packages = settings.packages?.length
    ? settings.packages
    : packagesFromObjectNames(await listObjects(token, bucket, 'stats/installs/installs_'));
  if (!packages.length) throw new StoreError(404, 'no_reports', 'No install reports in that bucket yet');

  const first = windowStart(settings, currency);
  const months = recentMonths(first < daysAgo(40) ? 4 : 2);
  const feeRate = settings.fee_rate ?? 0.15;
  const installs = new Map<string, number>();
  const sales = new Map<string, { purchases: number; sales: Map<string, number> }>();
  const readMonths = new Set<string>();
  const notes: string[] = [];
  let failedMonths = 0;

  for (const month of months) {
    if (Date.now() > deadline) {
      failedMonths++;
      continue;
    }
    try {
      for (const pkg of packages) {
        const file = await downloadObject(token, bucket, `stats/installs/installs_${pkg}_${month}_overview.csv`);
        if (!file) continue;
        const parsed = parseInstallsOverview(file);
        if (parsed.column === 'Install events') notes.push('Downloads use "Install events" because Play left "Daily User Installs" empty');
        for (const [day, n] of parsed.days) installs.set(day, (installs.get(day) ?? 0) + n);
      }
      const zip = await downloadObject(token, bucket, `sales/salesreport_${month}.zip`);
      if (zip && zip.length > MAX_REPORT_BYTES) {
        notes.push(`The ${month} sales report is too large to import here`);
      } else if (zip) {
        for (const [day, totals] of await parseSalesReport(zip, packages)) sales.set(day, totals);
      }
      readMonths.add(month);
    } catch (error) {
      if (error instanceof StoreError && [401, 403].includes(error.status)) throw error;
      console.error(`Google Play ${month} failed`, error);
      failedMonths++;
    }
  }

  // Replace every day of the months that were read, inside the 90-day window, up to yesterday
  const fetchedDays = daysBetween(first, daysAgo(1)).filter((day) => readMonths.has(day.slice(0, 7).replace('-', '')));
  const money = await converter(currency);
  const rows: MetricRow[] = [];
  for (const day of fetchedDays) {
    const downloads = installs.get(day) ?? 0;
    const daySales = sales.get(day);
    if (!downloads && !daySales) continue;
    const revenue = daySales ? round(await money.toProfile(daySales.sales, day)) : 0;
    rows.push({ day, revenue, fees: round(Math.max(0, revenue) * feeRate), organic_downloads: downloads, purchases: daySales?.purchases ?? 0 });
  }
  const syncedThrough = failedMonths ? (settings.synced_through ?? null) : fetchedDays.at(-1) ?? settings.synced_through ?? null;
  return { rows, fetchedDays, syncedThrough, failedDays: failedMonths * 30, skippedCurrencies: [...money.skipped], notes: [...new Set(notes)] };
}

// Checks the pasted credentials, makes one real call with them, and returns what to store
async function prepareConnect(provider: Provider, credentials: Record<string, unknown>) {
  if (provider === 'app_store') {
    const issuerId = String(credentials.issuerId ?? '').trim();
    const keyId = String(credentials.keyId ?? '').trim();
    const privateKey = String(credentials.privateKey ?? '').trim();
    const vendorNumber = String(credentials.vendorNumber ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(issuerId)) throw new StoreError(400, 'input', 'The Issuer ID is the long ID shown above your keys in App Store Connect (36 characters).');
    if (!/^[A-Z0-9]{10}$/.test(keyId)) throw new StoreError(400, 'input', 'The Key ID is 10 letters and numbers, shown next to the key in App Store Connect.');
    if (!privateKey.includes('PRIVATE KEY')) throw new StoreError(400, 'input', 'Upload the .p8 file you downloaded when you created the key.');
    if (!/^\d{6,12}$/.test(vendorNumber)) throw new StoreError(400, 'input', 'The vendor number is a number found under Payments and Financial Reports.');
    const creds = { issuerId, keyId, privateKey };
    await fetchSalesDay(await appStoreToken(creds), vendorNumber, daysAgo(3)); // a report or a 404 both prove access
    return { secret: creds, settings: { vendor_number: vendorNumber }, label: `Vendor ${vendorNumber}` };
  }
  const account = parseServiceAccount(String(credentials.serviceAccount ?? ''));
  const bucket = normaliseBucket(String(credentials.bucket ?? ''));
  if (!/^pubsite_prod_[a-z0-9_]+$/i.test(bucket)) throw new StoreError(400, 'input', 'Copy the Cloud Storage URI from Play Console → Download reports. It starts with gs://pubsite_prod_.');
  const typedPackages = String(credentials.packages ?? '').split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
  if (typedPackages.some((p) => !/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(p))) throw new StoreError(400, 'input', 'Package names look like com.example.app, separated by commas.');
  const feeRate = Number(credentials.feeRate) === 0.3 ? 0.3 : 0.15;
  const token = await googleAccessToken(account);
  const found = packagesFromObjectNames(await listObjects(token, bucket, 'stats/installs/installs_'));
  const packages = typedPackages.length ? typedPackages : found;
  if (!packages.length) {
    throw new StoreError(404, 'no_reports', 'The service account can open the bucket, but there are no install reports in it yet. Play writes them once your app has been live for a few days.');
  }
  return {
    secret: account,
    settings: { bucket, packages, fee_rate: feeRate, client_email: account.client_email },
    label: `${packages.length === 1 ? packages[0] : `${packages.length} apps`}`,
  };
}

const explain = (provider: Provider, error: StoreError) =>
  error.code === 'input' || error.code === 'bad_key' || error.code === 'no_reports'
    ? error.message
    : provider === 'app_store' ? explainAppleError(error) : explainGoogleError(error);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const deadline = Date.now() + BUDGET_MS;

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(url, projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authError } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (authError || !user) return json({ error: 'Sign in first.' }, 401);

  // Bypasses RLS: only used for this user's rows, after the checks above
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  let body: { provider?: string; action?: string; credentials?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }
  const provider = body.provider as Provider;
  if (!(provider in LABELS)) return json({ error: 'Unknown store.' }, 400);
  const label = LABELS[provider];

  const { data: integration } = await admin
    .from('integrations')
    .select('status, settings, connected_at')
    .eq('user_id', user.id)
    .eq('provider', provider)
    .maybeSingle();

  if (body.action === 'disconnect') {
    const { error: secretError } = await admin.rpc('integration_delete_secret', { p_user: user.id, p_provider: provider });
    const { error: statusError } = await admin
      .from('integrations')
      .update({ status: 'disconnected', account_label: null, last_error: null, settings: {}, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('provider', provider);
    if (secretError || statusError) {
      console.error(`Failed to disconnect ${provider}`, secretError ?? statusError);
      return json({ error: `Could not disconnect ${label}. Try again.` }, 500);
    }
    return json({ disconnected: true });
  }
  if (body.action !== 'connect' && body.action !== 'sync') return json({ error: 'Unknown action.' }, 400);

  const { data: premium, error: premiumError } = await db.rpc('has_premium');
  if (premiumError) return json({ error: 'Could not check your plan. Try again.' }, 500);
  if (!premium) return json({ error: 'Integrations are a Premium feature.' }, 403);

  const { data: profile } = await db.from('profiles').select('currency').maybeSingle();
  const currency = profile?.currency ?? 'USD';
  let settings: Settings = (integration?.settings as Settings) ?? {};
  let secret: unknown;
  let accountLabel: string | undefined;

  try {
    if (body.action === 'connect') {
      const prepared = await prepareConnect(provider, body.credentials ?? {});
      const { error: storeError } = await admin.rpc('integration_store_secret', {
        p_user: user.id, p_provider: provider, p_secret: JSON.stringify(prepared.secret),
      });
      if (storeError) throw storeError;
      secret = prepared.secret;
      settings = prepared.settings; // a fresh connection starts a fresh 90-day import
      accountLabel = prepared.label;
    } else {
      const { data: stored, error: readError } = await admin.rpc('integration_get_secret', { p_user: user.id, p_provider: provider });
      if (readError) throw readError;
      if (!stored || integration?.status === 'disconnected') return json({ error: `${label} is not connected.` }, 400);
      secret = JSON.parse(stored);
    }

    const result = provider === 'app_store'
      ? await syncAppStore(secret as AppStoreCredentials, settings, currency, deadline)
      : await syncGooglePlay(secret as ServiceAccount, settings, currency, deadline);

    const { error: writeError } = await admin.rpc('replace_imported_metrics', {
      p_user: user.id, p_source: provider, p_days: result.fetchedDays, p_rows: result.rows,
    });
    if (writeError) throw writeError;

    const now = new Date().toISOString();
    const { error: integrationError } = await admin.from('integrations').upsert({
      user_id: user.id,
      provider,
      status: 'connected',
      ...(accountLabel ? { account_label: accountLabel } : {}),
      last_error: null,
      last_synced_at: now,
      updated_at: now,
      settings: { ...settings, synced_through: result.syncedThrough ?? settings.synced_through, currency },
      ...(integration?.connected_at && body.action === 'sync' ? {} : { connected_at: now }),
    });
    if (integrationError) throw integrationError;

    return json({
      days: result.fetchedDays.length,
      downloads: result.rows.reduce((n, r) => n + r.organic_downloads, 0),
      purchases: result.rows.reduce((n, r) => n + r.purchases, 0),
      currency,
      skippedCurrencies: result.skippedCurrencies,
      failedDays: result.failedDays,
      partial: result.failedDays > 0,
      notes: result.notes,
    });
  } catch (error) {
    if (error instanceof StoreError) {
      const message = explain(provider, error);
      // Stored credentials that stopped working are shown on the Integrations page
      if (body.action === 'sync' && error.code !== 'input') {
        await admin
          .from('integrations')
          .update({ status: 'error', last_error: message, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('provider', provider);
      }
      return json({ error: message }, 400);
    }
    console.error(`${provider} sync failed`, error instanceof Error ? error.message : error);
    return json({ error: `Could not import from ${label}. Try again.` }, 500);
  }
});
