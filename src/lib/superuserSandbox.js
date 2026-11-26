// Local persistent superuser sandbox (`test` / `1234`) providing Admin Premium access across
// every route, table, RPC, and Edge Function while keeping real Supabase untouched for normal accounts.

import { buildDeterministicDraft } from './legalDocs';
import { SECTIONS } from '../../supabase/functions/_shared/handoff/format.js';

export const SUPERUSER_ID = '00000000-0000-4000-8000-000000000001';
export const SUPERUSER_USERNAMES = ['test', 'test@vibeassist.app', 'test@vibeassist.local'];
export const SUPERUSER_PASSWORD = '1234';

const SESSION_KEY = 'vibeassist:superuser-session:v1';
const DB_KEY = 'vibeassist:superuser-db:v1';
const HANDOFF_TOKEN_PREFIX = 'va_local_share_';

const memoryStore = new Map();
const authListeners = new Set();
let monotonicClock = 0;

function nextIso() {
  const now = Date.now();
  monotonicClock = Math.max(monotonicClock + 1, now);
  return new Date(monotonicClock).toISOString();
}

function uid(prefix = 'loc') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  monotonicClock += 1;
  return `${prefix}-${monotonicClock.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isoDayOffset(offsetDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function readStore(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // fallback below
  }
  return memoryStore.get(key) ?? null;
}

function writeStore(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    // fallback below
  }
  if (value === null) memoryStore.delete(key);
  else memoryStore.set(key, value);
}

export const SUPERUSER_USER = {
  id: SUPERUSER_ID,
  email: 'test@vibeassist.app',
  role: 'authenticated',
  aud: 'authenticated',
  user_metadata: {
    username: 'test',
    name: 'Test Superuser',
    role: 'superuser',
  },
  app_metadata: {
    role: 'superuser',
    provider: 'local',
    providers: ['local'],
  },
};

export const SUPERUSER_SESSION = {
  access_token: 'va_superuser_local_token',
  refresh_token: 'va_superuser_local_refresh',
  token_type: 'bearer',
  expires_in: 31536000,
  expires_at: 4102444800,
  user: SUPERUSER_USER,
};

export function isSuperuserLogin(login) {
  return SUPERUSER_USERNAMES.includes(String(login ?? '').trim().toLowerCase());
}

export function isSuperuserCredentials(login, password) {
  return isSuperuserLogin(login) && String(password ?? '') === SUPERUSER_PASSWORD;
}

export function isLocalHandoffToken(token) {
  return String(token ?? '').startsWith(HANDOFF_TOKEN_PREFIX);
}

export function isSuperuserActive() {
  return readStore(SESSION_KEY) === 'active';
}

export function getSuperuserUser() {
  return isSuperuserActive() ? SUPERUSER_USER : null;
}

export function getSuperuserSession() {
  return isSuperuserActive() ? SUPERUSER_SESSION : null;
}

function emitAuth(event, session) {
  for (const listener of authListeners) {
    try {
      listener(event, session);
    } catch {
      // listener failure shouldn't break others
    }
  }
}

export function onSuperuserAuthChange(callback) {
  authListeners.add(callback);
  return {
    data: {
      subscription: {
        unsubscribe: () => authListeners.delete(callback),
      },
    },
  };
}

export function activateSuperuserSession() {
  ensureDb();
  writeStore(SESSION_KEY, 'active');
  emitAuth('SIGNED_IN', SUPERUSER_SESSION);
  return SUPERUSER_SESSION;
}

export function deactivateSuperuserSession() {
  writeStore(SESSION_KEY, null);
  emitAuth('SIGNED_OUT', null);
}

function buildSeedMetrics() {
  const rows = [];
  for (let offset = -59; offset <= 0; offset += 1) {
    const i = offset + 59;
    const wave = Math.sin(i / 3) * 0.14 + Math.sin(i / 7) * 0.08;
    const organic = Math.round((48 + i * 1.8) * (1 + wave));
    const paid = Math.round((18 + i * 0.65) * (1 - wave / 2));
    const purchases = Math.max(1, Math.round((organic + paid) * 0.048));
    const revenue = Math.round(purchases * 9.99 * 100) / 100;
    const day = isoDayOffset(offset);
    rows.push({
      user_id: SUPERUSER_ID,
      day,
      source: 'sample',
      revenue,
      fees: Math.round(revenue * 0.029 * 100) / 100,
      ad_spend: Math.round(paid * 0.85 * 100) / 100,
      organic_downloads: organic,
      paid_downloads: paid,
      purchases,
      active_users: Math.round(420 + i * 14 * (1 + wave)),
      updated_at: nextIso(),
    });
  }
  for (let offset = -6; offset <= 0; offset += 1) {
    const day = isoDayOffset(offset);
    const revenue = Math.round((145 + (offset + 6) * 28.5) * 100) / 100;
    rows.push({
      user_id: SUPERUSER_ID,
      day,
      source: 'stripe',
      revenue,
      fees: Math.round(revenue * 0.032 * 100) / 100,
      ad_spend: 0,
      organic_downloads: 0,
      paid_downloads: 0,
      purchases: Math.max(4, Math.round(revenue / 19)),
      active_users: null,
      updated_at: nextIso(),
    });
  }
  return rows;
}

export function buildInitialDb() {
  const nowIso = nextIso();
  const today = isoDayOffset(0);
  const planId = '11111111-1111-4000-8000-000000000001';
  const repoId = '22222222-2222-4000-8000-000000000001';
  const preflightRunId = '33333333-3333-4000-8000-000000000001';
  const redTeamRunId = '33333333-3333-4000-8000-000000000002';
  const handoffId = '44444444-4444-4000-8000-000000000001';

  const legalInputs = {
    appName: 'VibeAssist Studio',
    developerName: 'Test Superuser Labs',
    contactEmail: 'test@vibeassist.app',
    country: 'United States',
    website: 'https://vibeassist.app',
    platforms: ['web', 'ios', 'mac'],
    data: ['email', 'name', 'account', 'usage', 'ai_prompts'],
    services: ['supabase', 'stripe', 'anthropic', 'ollama_local'],
    otherServices: '',
    monetization: ['subscription', 'free'],
    jurisdictions: ['gdpr', 'ccpa', 'eu_ai_act'],
    children: false,
    accountDeletion: 'Inside Settings -> Account, or by emailing test@vibeassist.app.',
    effectiveDate: today,
  };
  const legalDraft = buildDeterministicDraft('privacy', legalInputs);

  return {
    profiles: [{
      id: SUPERUSER_ID,
      name: 'Test Superuser',
      age: 28,
      currency: 'USD',
      goals: ['Grow revenue', 'Launch a new app', 'Keep users coming back'],
      experience: 'Pro',
      profit_expectancy: '$10k - $50k',
      target_cac: 4.5,
      launch_checklist: {
        'ios.privacy_manifest': today,
        'web.https_headers': today,
        'ai_safety.no_client_keys': today,
      },
      created_at: nowIso,
      updated_at: nowIso,
    }],
    subscriptions: [{
      user_id: SUPERUSER_ID,
      plan: 'premium',
      source: 'admin',
      status: 'active',
      billing_cycle: null,
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: nowIso,
    }],
    daily_metrics: buildSeedMetrics(),
    integrations: [
      {
        user_id: SUPERUSER_ID,
        provider: 'stripe',
        status: 'connected',
        account_label: 'VibeAssist Test Store (acct_test_vibeassist)',
        last_error: null,
        last_synced_at: nowIso,
        settings: { currency: 'USD' },
        updated_at: nowIso,
      },
      {
        user_id: SUPERUSER_ID,
        provider: 'github',
        status: 'connected',
        account_label: 'test-superuser',
        last_error: null,
        last_synced_at: nowIso,
        expires_at: new Date(Date.now() + 90 * 864e5).toISOString(),
        settings: {},
        updated_at: nowIso,
      },
    ],
    ad_campaigns: [
      {
        id: '55555555-5555-4000-8000-000000000001',
        user_id: SUPERUSER_ID,
        network: 'apple_search',
        name: 'App Store Exact Keywords',
        status: 'active',
        spend: 420.5,
        revenue: 1680.0,
        installs: 210,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: '55555555-5555-4000-8000-000000000002',
        user_id: SUPERUSER_ID,
        network: 'google',
        name: 'Universal App Campaign - US/EU',
        status: 'active',
        spend: 315.0,
        revenue: 940.0,
        installs: 165,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: '55555555-5555-4000-8000-000000000003',
        user_id: SUPERUSER_ID,
        network: 'meta',
        name: 'Founder Demo Reels Retargeting',
        status: 'active',
        spend: 260.0,
        revenue: 1120.0,
        installs: 142,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: '55555555-5555-4000-8000-000000000004',
        user_id: SUPERUSER_ID,
        network: 'tiktok',
        name: 'AI Productivity Spark Ads',
        status: 'paused',
        spend: 150.0,
        revenue: 295.0,
        installs: 96,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ],
    advisor_plans: [{
      id: planId,
      user_id: SUPERUSER_ID,
      created_at: nowIso,
      period_days: 30,
      focus: 'revenue',
      summary: 'App Store Exact Keywords and Meta Retargeting are generating 3.9x-4.3x ROAS while organic conversion sits near 4.8%. Double down on high-intent search and tighten onboarding activation.',
      missing_data: [],
      context: { includes_sample: true },
      model: 'Claude 4.5 Sonnet (Superuser)',
      updated_at: nowIso,
    }],
    plan_steps: [
      {
        id: '66666666-6666-4000-8000-000000000001',
        plan_id: planId,
        user_id: SUPERUSER_ID,
        position: 1,
        title: 'Shift budget from paused TikTok test to App Store Exact',
        detail: 'Apple Search Ads returned 3.99x ROAS at $2.00 cost per install. Reallocate paused TikTok budget into top-converting exact match terms.',
        based_on: 'Ad campaign ROAS and install CAC breakdown',
        effort: 'small',
        status: 'done',
      },
      {
        id: '66666666-6666-4000-8000-000000000002',
        plan_id: planId,
        user_id: SUPERUSER_ID,
        position: 2,
        title: 'Add paywall annual toggle prompt on first export',
        detail: 'Showing the yearly discount right when users export their first report typically lifts yearly plan share by 15-25%.',
        based_on: 'Stripe 7-day purchase velocity & conversion rate',
        effort: 'medium',
        status: 'kept',
      },
      {
        id: '66666666-6666-4000-8000-000000000003',
        plan_id: planId,
        user_id: SUPERUSER_ID,
        position: 3,
        title: 'Publish PrivacyInfo.xcprivacy and headers before v2.1 submission',
        detail: 'Run Browser Security Lab and attach your generated privacy manifest so App Store review approves without missing-reason rejections.',
        based_on: 'Legal & Security readiness score',
        effort: 'small',
        status: 'suggested',
      },
      {
        id: '66666666-6666-4000-8000-000000000004',
        plan_id: planId,
        user_id: SUPERUSER_ID,
        position: 4,
        title: 'Set up BYOK Gemini Flash fallback route for spike resilience',
        detail: 'Import a secondary model in Import Your AI so analysis stays zero-downtime during cloud rate limits.',
        based_on: 'Active workflow usage',
        effort: 'medium',
        status: 'suggested',
      },
    ],
    engine_repos: [{
      id: repoId,
      user_id: SUPERUSER_ID,
      full_name: 'test-superuser/vibeassist-app',
      default_branch: 'main',
      created_at: nowIso,
    }],
    engine_runs: [
      {
        id: redTeamRunId,
        repo_id: repoId,
        user_id: SUPERUSER_ID,
        module: 'red_team',
        trigger: 'manual',
        target_ref: 'main',
        commit_sha: 'a8f31c90b1d2e4f567890123456789abcdef1234',
        pr_number: null,
        status: 'succeeded',
        outcome: 'warn',
        summary: 'Reviewed auth boundaries, payment webhook signatures, and AI prompt injection vectors.',
        stats: { diff: { new: 1, still_open: 1, resolved: 2 } },
        created_at: nowIso,
      },
      {
        id: preflightRunId,
        repo_id: repoId,
        user_id: SUPERUSER_ID,
        module: 'preflight',
        trigger: 'manual',
        target_ref: 'main',
        commit_sha: '91e20a77c4d1b2e34567890123456789abcdef00',
        pr_number: null,
        status: 'succeeded',
        outcome: 'pass',
        summary: 'No exposed secret keys found across client bundles. All Supabase queries enforce RLS.',
        stats: { drift_score: 96, diff: { new: 0, still_open: 0, resolved: 1 } },
        created_at: nowIso,
      },
    ],
    engine_run_events: [
      { id: 1, run_id: redTeamRunId, user_id: SUPERUSER_ID, at: nowIso, level: 'info', message: 'Fetched tree for test-superuser/vibeassist-app@main' },
      { id: 2, run_id: redTeamRunId, user_id: SUPERUSER_ID, at: nowIso, level: 'warn', message: 'Flagged 1 webhook replay hardening opportunity in billing handler' },
      { id: 3, run_id: redTeamRunId, user_id: SUPERUSER_ID, at: nowIso, level: 'ok', message: 'Completed Red Team review with 2 findings' },
      { id: 4, run_id: preflightRunId, user_id: SUPERUSER_ID, at: nowIso, level: 'info', message: 'Scanned 148 source files for leaked API keys and unsafe CSP rules' },
      { id: 5, run_id: preflightRunId, user_id: SUPERUSER_ID, at: nowIso, level: 'ok', message: 'Pre-Flight Scanner passed' },
    ],
    engine_findings: [
      {
        id: '77777777-7777-4000-8000-000000000001',
        run_id: redTeamRunId,
        user_id: SUPERUSER_ID,
        severity: 'medium',
        status: 'open',
        title: 'Add strict idempotency key check on Stripe checkout return handler',
        file: 'supabase/functions/billing/index.ts',
        line_start: 84,
        explanation: 'Returning twice with the same session_id triggers duplicate plan sync calls under rapid reloads.',
        fix: 'Cache processed Stripe checkout session IDs in billing_events or short-circuit unchanged periods.',
        evidence: 'const synced = await syncCheckoutSession(sessionId);',
      },
      {
        id: '77777777-7777-4000-8000-000000000002',
        run_id: redTeamRunId,
        user_id: SUPERUSER_ID,
        severity: 'low',
        status: 'open',
        title: 'Document CSP connect-src allowlist for local Ollama endpoints',
        file: 'public/_headers',
        line_start: 5,
        explanation: 'Tighter CSP headers improve Chrome defense against XSS exfiltration.',
        fix: 'Use Browser Security Lab -> HTTP Headers & CSP to export an explicit connect-src allowlist.',
        evidence: 'Content-Security-Policy: default-src \'self\'',
      },
    ],
    engine_context_rules: [
      {
        id: '88888888-8888-4000-8000-000000000001',
        repo_id: repoId,
        user_id: SUPERUSER_ID,
        title: 'Keep server secrets out of VITE_* env vars',
        body: 'Never prefix service role keys, Stripe sk_live_ keys, or webhook secrets with VITE_.',
        kind: 'forbid_pattern',
        pattern: 'VITE_.*(SECRET|SERVICE_ROLE|PRIVATE)',
        paths: ['src/**/*', '.env*'],
        severity: 'critical',
        enabled: true,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: '88888888-8888-4000-8000-000000000002',
        repo_id: repoId,
        user_id: SUPERUSER_ID,
        title: 'Database access stays inside src/lib helpers',
        body: 'Route external AI and billing calls through documented helpers instead of raw fetch in views.',
        kind: 'ai',
        pattern: null,
        paths: ['src/pages/**/*.jsx'],
        severity: 'medium',
        enabled: true,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ],
    engine_snapshots: [
      {
        id: '99999999-9999-4000-8000-000000000001',
        repo_id: repoId,
        user_id: SUPERUSER_ID,
        tag: 'vibe-snapshot-v2.0-green',
        commit_sha: '91e20a77c4d1b2e34567890123456789abcdef00',
        branch: 'main',
        run_url: 'https://github.com/test-superuser/vibeassist-app/actions',
        created_at: nowIso,
      },
    ],
    gateway_provider_keys: [],
    gateway_routes: [],
    gateway_usage: [],
    engine_ai_settings: [{
      user_id: SUPERUSER_ID,
      provider_key_id: null,
      model: '',
      updated_at: nowIso,
    }],
    api_keys: [],
    handoffs: [{
      id: handoffId,
      user_id: SUPERUSER_ID,
      title: 'VibeAssist Architecture & Security Hardening',
      source: 'claude_code',
      method: 'ai',
      conversation_date: today,
      message_count: 24,
      model: 'Claude 4.5 Sonnet',
      sections: [
        { key: 'goal', heading: 'Goal', body: 'Ship the Legal & Security Compliance Hub, Import Your AI vault, and full-access superuser sandbox.' },
        { key: 'state', heading: 'Where we are', body: 'Landing page, BYOK AI engine, Browser Security Lab, App Store PrivacyInfo.xcprivacy builder, and test:1234 superuser access are active.' },
        { key: 'decisions', heading: 'Decisions made (and why)', body: 'Keep BYOK keys client-side by default in browser storage while letting Premium users opt into encrypted gateway sync.' },
        { key: 'next', heading: 'Next steps', body: 'Test CSV revenue imports, generate a privacy policy draft, and review Ad Manager ROAS.' },
        { key: 'artifacts', heading: 'Key files and snippets', body: 'src/lib/aiClient.js, src/components/SecurityCenter.jsx, src/lib/superuserSandbox.js' },
        { key: 'preferences', heading: 'Preferences and constraints', body: 'No secret keys leaked into client bundles; verify changes with Vitest and Oxlint.' },
      ],
      created_at: nowIso,
      updated_at: nowIso,
    }],
    handoff_links: [],
    legal_documents: [{
      id: 'aaaaaaaa-aaaa-4000-8000-000000000001',
      user_id: SUPERUSER_ID,
      kind: 'privacy',
      title: legalDraft.title,
      inputs: { ...legalInputs, docKind: 'privacy' },
      sections: legalDraft.sections,
      model: 'VibeAssist Template',
      created_at: nowIso,
      updated_at: nowIso,
    }],
    newsletter_subscribers: [{
      user_id: SUPERUSER_ID,
      status: 'active',
      include_numbers: true,
      confirm_sent_at: nowIso,
      confirmed_at: nowIso,
    }],
    ai_usage: [],
  };
}

function ensureDb() {
  const raw = readStore(DB_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.profiles)) {
        return parsed;
      }
    } catch {
      // reset corrupted storage
    }
  }
  const initial = buildInitialDb();
  writeStore(DB_KEY, JSON.stringify(initial));
  return initial;
}

function saveDb(db) {
  writeStore(DB_KEY, JSON.stringify(db));
}

export function resetSuperuserDb() {
  const fresh = buildInitialDb();
  saveDb(fresh);
  return fresh;
}

function matchesFilters(row, filters) {
  for (const { op, col, val } of filters) {
    const v = row?.[col];
    if (op === 'eq' && v !== val) return false;
    if (op === 'neq' && v === val) return false;
    if (op === 'in' && (!Array.isArray(val) || !val.includes(v))) return false;
    if (op === 'is' && ((val === null && v !== null && v !== undefined) || (val !== null && v !== val))) return false;
    if (op === 'gte' && (v === undefined || v === null || v < val)) return false;
    if (op === 'lte' && (v === undefined || v === null || v > val)) return false;
    if (op === 'gt' && (v === undefined || v === null || v <= val)) return false;
    if (op === 'lt' && (v === undefined || v === null || v >= val)) return false;
  }
  return true;
}

function applyOrders(rows, orders) {
  if (!orders.length) return rows;
  return [...rows].sort((a, b) => {
    for (const { col, ascending } of orders) {
      const av = a?.[col];
      const bv = b?.[col];
      if (av === bv) continue;
      if (av === null || av === undefined) return ascending ? -1 : 1;
      if (bv === null || bv === undefined) return ascending ? 1 : -1;
      const cmp = av < bv ? -1 : 1;
      return ascending ? cmp : -cmp;
    }
    return 0;
  });
}

const NATURAL_KEY_TABLES = new Set([
  'daily_metrics',
  'integrations',
  'newsletter_subscribers',
  'subscriptions',
  'engine_ai_settings',
]);

function normalizeInsertRow(table, row) {
  const iso = nextIso();
  const base = { ...row };
  if (base.user_id === undefined) base.user_id = SUPERUSER_ID;
  if (!NATURAL_KEY_TABLES.has(table) && base.id === undefined) {
    base.id = table === 'profiles' ? SUPERUSER_ID : uid(table.slice(0, 4));
  }
  if (base.created_at === undefined && table !== 'daily_metrics' && table !== 'subscriptions') {
    base.created_at = iso;
  }
  base.updated_at = iso;
  return base;
}

function conflictMatch(row, candidate, onConflict) {
  if (onConflict === 'user_id,day,source') {
    return (row.user_id ?? SUPERUSER_ID) === (candidate.user_id ?? SUPERUSER_ID)
      && row.day === candidate.day
      && row.source === candidate.source;
  }
  if (onConflict === 'user_id,provider') {
    return (row.user_id ?? SUPERUSER_ID) === (candidate.user_id ?? SUPERUSER_ID)
      && row.provider === candidate.provider;
  }
  if (onConflict) {
    const cols = onConflict.split(',').map((s) => s.trim()).filter(Boolean);
    return cols.every((c) => row[c] === candidate[c]);
  }
  return Boolean(candidate.id && row.id === candidate.id);
}

function decorateRows(table, rows, db, selectCols) {
  const cloned = rows.map((r) => ({ ...r }));
  if (table === 'advisor_plans' && typeof selectCols === 'string' && selectCols.includes('plan_steps')) {
    return cloned.map((plan) => ({
      ...plan,
      plan_steps: (db.plan_steps ?? []).filter((s) => s.plan_id === plan.id).map((s) => ({ ...s })),
    }));
  }
  return cloned;
}

function cascadeDelete(table, removedRows, db) {
  if (!removedRows.length) return;
  const ids = new Set(removedRows.map((r) => r.id).filter(Boolean));
  if (!ids.size) return;
  if (table === 'engine_repos') {
    const removedRuns = (db.engine_runs ?? []).filter((r) => ids.has(r.repo_id));
    const runIds = new Set(removedRuns.map((r) => r.id));
    db.engine_runs = (db.engine_runs ?? []).filter((r) => !ids.has(r.repo_id));
    db.engine_run_events = (db.engine_run_events ?? []).filter((e) => !runIds.has(e.run_id));
    db.engine_findings = (db.engine_findings ?? []).filter((f) => !runIds.has(f.run_id));
    db.engine_context_rules = (db.engine_context_rules ?? []).filter((c) => !ids.has(c.repo_id));
    db.engine_snapshots = (db.engine_snapshots ?? []).filter((s) => !ids.has(s.repo_id));
  } else if (table === 'advisor_plans') {
    db.plan_steps = (db.plan_steps ?? []).filter((s) => !ids.has(s.plan_id));
  } else if (table === 'handoffs') {
    db.handoff_links = (db.handoff_links ?? []).filter((l) => !ids.has(l.handoff_id));
  }
}

export function superuserFrom(table) {
  const state = {
    op: 'select',
    selectCols: '*',
    selectOpts: null,
    payload: null,
    upsertOpts: null,
    filters: [],
    orders: [],
    limitCount: null,
    rangeBounds: null,
    cardinality: null, // 'single' | 'maybeSingle'
    returnRows: false,
  };

  function execute() {
    const db = ensureDb();
    const rows = Array.isArray(db[table]) ? db[table] : [];
    db[table] = rows;

    let resultData = [];

    if (state.op === 'select') {
      const matched = rows.filter((r) => matchesFilters(r, state.filters));
      if (state.selectOpts?.head) {
        return Promise.resolve({ data: null, count: matched.length, error: null });
      }
      let ordered = applyOrders(matched, state.orders);
      if (state.rangeBounds) {
        ordered = ordered.slice(state.rangeBounds[0], state.rangeBounds[1] + 1);
      } else if (state.limitCount !== null) {
        ordered = ordered.slice(0, state.limitCount);
      }
      resultData = decorateRows(table, ordered, db, state.selectCols);
      if (state.cardinality === 'single') {
        if (resultData.length !== 1) {
          return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
        }
        return Promise.resolve({ data: resultData[0], count: state.selectOpts?.count ? matched.length : null, error: null });
      }
      if (state.cardinality === 'maybeSingle') {
        return Promise.resolve({ data: resultData[0] ?? null, count: state.selectOpts?.count ? matched.length : null, error: null });
      }
      return Promise.resolve({ data: resultData, count: state.selectOpts?.count ? matched.length : null, error: null });
    }

    if (state.op === 'insert') {
      const items = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((r) => normalizeInsertRow(table, r));
      if (table === 'gateway_routes') {
        for (const item of items) {
          if (rows.some((r) => r.alias === item.alias)) {
            return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
          }
        }
      }
      if (table === 'daily_metrics') {
        for (const item of items) {
          if (rows.some((r) => r.day === item.day && r.source === item.source && (r.user_id ?? SUPERUSER_ID) === item.user_id)) {
            return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
          }
        }
      }
      rows.push(...items);
      saveDb(db);
      resultData = decorateRows(table, items, db, state.selectCols);
    } else if (state.op === 'upsert') {
      const items = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((r) => normalizeInsertRow(table, r));
      const upserted = [];
      for (const item of items) {
        const idx = rows.findIndex((existing) => conflictMatch(existing, item, state.upsertOpts?.onConflict));
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...item, updated_at: item.updated_at };
          upserted.push(rows[idx]);
        } else {
          rows.push(item);
          upserted.push(item);
        }
      }
      saveDb(db);
      resultData = decorateRows(table, upserted, db, state.selectCols);
    } else if (state.op === 'update') {
      if (table === 'gateway_routes' && state.payload?.alias) {
        const dupe = rows.some((r) => !matchesFilters(r, state.filters) && r.alias === state.payload.alias);
        if (dupe) {
          return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
        }
      }
      const updated = [];
      const nextIsoStamp = nextIso();
      for (let i = 0; i < rows.length; i += 1) {
        if (matchesFilters(rows[i], state.filters)) {
          rows[i] = { ...rows[i], ...state.payload, updated_at: nextIsoStamp };
          updated.push(rows[i]);
        }
      }
      saveDb(db);
      resultData = decorateRows(table, updated, db, state.selectCols);
    } else if (state.op === 'delete') {
      const removed = [];
      db[table] = rows.filter((r) => {
        if (matchesFilters(r, state.filters)) {
          removed.push(r);
          return false;
        }
        return true;
      });
      cascadeDelete(table, removed, db);
      saveDb(db);
      resultData = decorateRows(table, removed, db, state.selectCols);
    }

    if (state.cardinality === 'single') {
      if (resultData.length !== 1) {
        return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
      }
      return Promise.resolve({ data: resultData[0], error: null });
    }
    if (state.cardinality === 'maybeSingle') {
      return Promise.resolve({ data: resultData[0] ?? null, error: null });
    }
    return Promise.resolve({ data: state.returnRows || state.op === 'select' ? resultData : resultData, error: null });
  }

  const builder = {
    select(columns = '*', options = null) {
      if (state.op !== 'select') {
        state.returnRows = true;
      }
      state.selectCols = columns;
      state.selectOpts = options;
      return builder;
    },
    insert(payload) {
      state.op = 'insert';
      state.payload = payload;
      return builder;
    },
    update(payload) {
      state.op = 'update';
      state.payload = payload;
      return builder;
    },
    upsert(payload, options = null) {
      state.op = 'upsert';
      state.payload = payload;
      state.upsertOpts = options;
      return builder;
    },
    delete() {
      state.op = 'delete';
      return builder;
    },
    eq(col, val) {
      state.filters.push({ op: 'eq', col, val });
      return builder;
    },
    neq(col, val) {
      state.filters.push({ op: 'neq', col, val });
      return builder;
    },
    in(col, val) {
      state.filters.push({ op: 'in', col, val });
      return builder;
    },
    is(col, val) {
      state.filters.push({ op: 'is', col, val });
      return builder;
    },
    gte(col, val) {
      state.filters.push({ op: 'gte', col, val });
      return builder;
    },
    lte(col, val) {
      state.filters.push({ op: 'lte', col, val });
      return builder;
    },
    gt(col, val) {
      state.filters.push({ op: 'gt', col, val });
      return builder;
    },
    lt(col, val) {
      state.filters.push({ op: 'lt', col, val });
      return builder;
    },
    order(col, options = {}) {
      state.orders.push({ col, ascending: options.ascending !== false });
      return builder;
    },
    limit(n) {
      state.limitCount = n;
      return builder;
    },
    range(from, to) {
      state.rangeBounds = [from, to];
      return builder;
    },
    single() {
      state.cardinality = 'single';
      return execute();
    },
    maybeSingle() {
      state.cardinality = 'maybeSingle';
      return execute();
    },
    then(onFulfilled, onRejected) {
      return execute().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return execute().catch(onRejected);
    },
    finally(onFinally) {
      return execute().finally(onFinally);
    },
  };

  return builder;
}

export async function superuserRpc(name, args = {}) {
  const db = ensureDb();
  const iso = nextIso();

  if (name === 'create_api_key') {
    for (const k of db.api_keys) {
      if (k.scope === 'metrics' && !k.revoked_at) k.revoked_at = iso;
    }
    const raw = `va_test_metrics_${Math.random().toString(36).slice(2, 12)}`;
    db.api_keys.push({
      id: uid('key'),
      user_id: SUPERUSER_ID,
      scope: 'metrics',
      label: 'Metrics key',
      key_prefix: raw.slice(0, 14),
      raw_key: raw,
      created_at: iso,
      last_used_at: null,
      revoked_at: null,
    });
    saveDb(db);
    return { data: raw, error: null };
  }

  if (name === 'revoke_api_key') {
    for (const k of db.api_keys) {
      if (k.scope === 'metrics' && !k.revoked_at) k.revoked_at = iso;
    }
    saveDb(db);
    return { data: null, error: null };
  }

  if (name === 'ingest_metrics') {
    const key = db.api_keys.find((k) => k.scope === 'metrics' && !k.revoked_at && k.raw_key === args.p_api_key);
    if (!key) {
      return { data: null, error: { message: 'Invalid or revoked API key.' } };
    }
    key.last_used_at = iso;
    const rows = Array.isArray(args.p_rows) ? args.p_rows : [];
    for (const r of rows) {
      const entry = {
        user_id: SUPERUSER_ID,
        day: r.date ?? isoDayOffset(0),
        source: 'custom_api',
        revenue: Number(r.revenue ?? 0),
        fees: Number(r.fees ?? 0),
        ad_spend: Number(r.ad_spend ?? 0),
        organic_downloads: Number(r.organic_downloads ?? 0),
        paid_downloads: Number(r.paid_downloads ?? 0),
        purchases: Number(r.purchases ?? 0),
        active_users: r.active_users ?? null,
        updated_at: iso,
      };
      const idx = db.daily_metrics.findIndex((m) => m.day === entry.day && m.source === 'custom_api');
      if (idx >= 0) db.daily_metrics[idx] = entry;
      else db.daily_metrics.push(entry);
    }
    saveDb(db);
    return { data: rows.length, error: null };
  }

  if (name === 'create_scoped_api_key') {
    const scope = args.p_scope ?? 'gateway';
    if (scope === 'engine') {
      for (const k of db.api_keys) {
        if (k.scope === 'engine' && !k.revoked_at) k.revoked_at = iso;
      }
    }
    const raw = `va_test_${scope}_${Math.random().toString(36).slice(2, 12)}`;
    db.api_keys.push({
      id: uid('skey'),
      user_id: SUPERUSER_ID,
      scope,
      label: args.p_label ?? `${scope} key`,
      key_prefix: raw.slice(0, 14),
      raw_key: raw,
      created_at: iso,
      last_used_at: null,
      revoked_at: null,
    });
    saveDb(db);
    return { data: raw, error: null };
  }

  if (name === 'revoke_scoped_api_key') {
    const target = db.api_keys.find((k) => k.id === args.p_id);
    if (target) target.revoked_at = iso;
    saveDb(db);
    return { data: null, error: null };
  }

  if (name === 'create_handoff_link') {
    const days = Number(args.p_days ?? 7);
    const token = `${HANDOFF_TOKEN_PREFIX}${Math.random().toString(36).slice(2, 12)}`;
    const expiresAt = new Date(Date.now() + days * 864e5).toISOString();
    db.handoff_links.unshift({
      id: uid('link'),
      handoff_id: args.p_handoff,
      token,
      expires_at: expiresAt,
      revoked_at: null,
      views: 0,
      last_viewed_at: null,
      created_at: iso,
    });
    saveDb(db);
    return { data: { token, expires_at: expiresAt }, error: null };
  }

  if (name === 'revoke_handoff_link') {
    const link = db.handoff_links.find((l) => l.id === args.p_link);
    if (link) link.revoked_at = iso;
    saveDb(db);
    return { data: null, error: null };
  }

  if (name === 'get_shared_handoff') {
    const link = db.handoff_links.find((l) => l.token === args.p_token);
    if (!link) return { data: { status: 'not_found' }, error: null };
    if (link.revoked_at) return { data: { status: 'revoked' }, error: null };
    if (new Date(link.expires_at) <= new Date()) return { data: { status: 'expired' }, error: null };
    const handoff = db.handoffs.find((h) => h.id === link.handoff_id);
    if (!handoff) return { data: { status: 'not_found' }, error: null };
    link.views += 1;
    link.last_viewed_at = iso;
    saveDb(db);
    return { data: { status: 'ok', handoff, expires_at: link.expires_at }, error: null };
  }

  if (name === 'newsletter_unsubscribe') {
    if (db.newsletter_subscribers[0]) db.newsletter_subscribers[0].status = 'unsubscribed';
    saveDb(db);
    return { data: null, error: null };
  }

  if (name === 'choose_plan') {
    db.subscriptions[0] = {
      user_id: SUPERUSER_ID,
      plan: args.p_plan ?? 'premium',
      source: args.p_plan === 'free' ? 'free' : 'admin',
      status: 'active',
      billing_cycle: args.p_billing_cycle ?? null,
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: iso,
    };
    saveDb(db);
    return { data: db.subscriptions[0], error: null };
  }

  return { data: null, error: null };
}

function summarizeDbMetrics(db, periodDays = 30) {
  const cutoff = isoDayOffset(-(periodDays - 1));
  const rows = db.daily_metrics.filter((r) => r.day >= cutoff);
  return rows.reduce((t, r) => ({
    revenue: t.revenue + Number(r.revenue ?? 0),
    fees: t.fees + Number(r.fees ?? 0),
    adSpend: t.adSpend + Number(r.ad_spend ?? 0),
    downloads: t.downloads + Number(r.organic_downloads ?? 0) + Number(r.paid_downloads ?? 0),
    purchases: t.purchases + Number(r.purchases ?? 0),
  }), { revenue: 0, fees: 0, adSpend: 0, downloads: 0, purchases: 0 });
}

function handleEngineFunction(body, db) {
  const iso = nextIso();
  const action = body.action;

  if (action === 'github_connect') {
    const row = {
      user_id: SUPERUSER_ID,
      provider: 'github',
      status: 'connected',
      account_label: 'test-superuser',
      last_error: null,
      last_synced_at: iso,
      expires_at: new Date(Date.now() + 90 * 864e5).toISOString(),
      settings: {},
      updated_at: iso,
    };
    const idx = db.integrations.findIndex((i) => i.provider === 'github');
    if (idx >= 0) db.integrations[idx] = row;
    else db.integrations.push(row);
    saveDb(db);
    return { data: { login: 'test-superuser' }, status: 200 };
  }

  if (action === 'github_disconnect') {
    db.integrations = db.integrations.filter((i) => i.provider !== 'github');
    saveDb(db);
    return { data: { ok: true }, status: 200 };
  }

  if (action === 'github_repos') {
    return {
      data: {
        repos: [
          { full_name: 'test-superuser/vibeassist-app' },
          { full_name: 'test-superuser/indie-paywall-kit' },
          { full_name: 'test-superuser/local-llm-proxy' },
        ],
      },
      status: 200,
    };
  }

  if (action === 'repo_add') {
    const repo = {
      id: uid('repo'),
      user_id: SUPERUSER_ID,
      full_name: body.full_name,
      default_branch: 'main',
      created_at: iso,
    };
    db.engine_repos.push(repo);
    saveDb(db);
    return { data: { repo }, status: 200 };
  }

  if (action === 'github_prs') {
    if (body.state === 'closed') {
      return {
        data: {
          pulls: [
            { number: 42, title: 'feat: launch Security Center & CSV Importer', sha: '91e20a77c4d1b2e34567890123456789abcdef00' },
            { number: 39, title: 'fix: enforce RLS on metric upserts', sha: '7c4e12098765432109876543210987654321abcd' },
          ],
        },
        status: 200,
      };
    }
    return {
      data: {
        pulls: [
          { number: 48, title: 'feat: add yearly pricing banner on Dashboard' },
          { number: 47, title: 'chore: update PrivacyInfo.xcprivacy types' },
        ],
      },
      status: 200,
    };
  }

  if (action === 'run') {
    const runId = uid('run');
    const mod = body.module ?? 'preflight';
    const isBacktest = Boolean(body.backtest_of);
    const refVal = body.target?.ref ?? 'main';
    const runRow = {
      id: runId,
      repo_id: body.repo_id,
      user_id: SUPERUSER_ID,
      module: mod,
      trigger: isBacktest ? 'backtest' : 'manual',
      target_ref: body.target?.kind === 'pr' ? `PR #${refVal}` : refVal,
      pr_number: body.target?.kind === 'pr' ? Number(refVal) || null : null,
      commit_sha: 'c41f09b28d76e5432109876543210987654321fe',
      status: 'succeeded',
      outcome: mod === 'red_team' ? 'warn' : 'pass',
      summary: `Completed ${mod} check cleanly inside Superuser Sandbox.`,
      stats: isBacktest
        ? { backtest: { still_open: 1, fixed_since: 2, new_since: 0 } }
        : { drift_score: 97, diff: { new: 0, still_open: 1, resolved: 1 } },
      created_at: iso,
    };
    db.engine_runs.unshift(runRow);
    db.engine_run_events.push(
      { id: Date.now(), run_id: runId, user_id: SUPERUSER_ID, at: iso, level: 'info', message: `Started ${mod} check on ${runRow.target_ref}` },
      { id: Date.now() + 1, run_id: runId, user_id: SUPERUSER_ID, at: iso, level: 'ok', message: `Finished ${mod} with status ${runRow.outcome}` },
    );
    if (mod === 'red_team') {
      db.engine_findings.push({
        id: uid('find'),
        run_id: runId,
        user_id: SUPERUSER_ID,
        severity: 'low',
        status: 'open',
        title: 'Consider explicit rate-limit header backoff on webhook retry',
        file: 'src/lib/integrations.js',
        line_start: 27,
        explanation: 'Adding jitter reduces thundering-herd retries during upstream incidents.',
        fix: 'Use exponential backoff before retrying sync calls.',
        evidence: 'Promise.allSettled(targets.map(...))',
      });
    }
    saveDb(db);
    return { data: { run_id: runId }, status: 200 };
  }

  if (action === 'rules_suggest') {
    return {
      data: {
        from: 'architecture-review',
        rules: [
          {
            title: 'Validate CSV headers before database upsert',
            body: 'Ensure untrusted CSV imports strip control characters and coerce negative counts safely.',
            paths: ['src/components/MetricsCsvImport.jsx'],
            severity: 'high',
          },
        ],
      },
      status: 200,
    };
  }

  if (action === 'ai_settings_save') {
    db.engine_ai_settings = [{
      user_id: SUPERUSER_ID,
      provider_key_id: body.provider_key_id ?? null,
      model: body.model ?? '',
      updated_at: iso,
    }];
    saveDb(db);
    return { data: { settings: db.engine_ai_settings[0] }, status: 200 };
  }

  if (action === 'ai_test') {
    const settings = db.engine_ai_settings?.[0];
    const key = db.gateway_provider_keys?.find((k) => k.id === settings?.provider_key_id);
    if (key) {
      return {
        data: { own_key: true, label: key.label, model: settings?.model || 'default-model' },
        status: 200,
      };
    }
    return { data: { own_key: false, model: 'claude-sonnet-4-5' }, status: 200 };
  }

  if (action === 'gateway_key_add') {
    const keyRow = {
      id: uid('gk'),
      user_id: SUPERUSER_ID,
      provider: body.provider ?? 'anthropic',
      label: body.label?.trim() || `${body.provider ?? 'Provider'} key`,
      key_prefix: `${String(body.key ?? 'sk_...').slice(0, 8)}…`,
      created_at: iso,
      last_used_at: null,
      last_error: null,
    };
    db.gateway_provider_keys.push(keyRow);
    saveDb(db);
    return { data: { key: keyRow }, status: 200 };
  }

  if (action === 'gateway_key_remove') {
    db.gateway_provider_keys = db.gateway_provider_keys.filter((k) => k.id !== body.id);
    saveDb(db);
    return { data: { ok: true }, status: 200 };
  }

  return { data: { ok: true }, status: 200 };
}

export async function superuserCallFunction(name, body = {}, opts = {}, realClient = null) {
  if (opts?.signal?.aborted) return { aborted: true, data: null, status: 0 };
  const db = ensureDb();
  const iso = nextIso();

  if (name === 'billing') {
    if (body.action === 'config') {
      return {
        data: {
          configured: true,
          livemode: false,
          promo: { open: false, eligible: false },
          pass: { open: false, eligible: false },
        },
        status: 200,
      };
    }
    return {
      data: { error: 'already_subscribed', subscription: db.subscriptions[0] },
      status: body.action === 'sync' ? 200 : 400,
    };
  }

  if (name === 'stripe-sync') {
    if (body.action === 'disconnect') {
      db.integrations = db.integrations.filter((i) => i.provider !== 'stripe');
      saveDb(db);
      return { data: { ok: true }, status: 200 };
    }
    db.integrations = [
      ...db.integrations.filter((i) => i.provider !== 'stripe'),
      {
        user_id: SUPERUSER_ID,
        provider: 'stripe',
        status: 'connected',
        account_label: 'VibeAssist Test Store (acct_test_vibeassist)',
        last_error: null,
        last_synced_at: iso,
        settings: { currency: 'USD' },
        updated_at: iso,
      },
    ];
    saveDb(db);
    return { data: { transactions: 14, days: 7, currency: 'USD' }, status: 200 };
  }

  if (name === 'store-sync') {
    const provider = body.provider ?? 'app_store';
    if (body.action === 'disconnect') {
      db.integrations = db.integrations.filter((i) => i.provider !== provider);
    } else {
      db.integrations = [
        ...db.integrations.filter((i) => i.provider !== provider),
        {
          user_id: SUPERUSER_ID,
          provider,
          status: 'connected',
          account_label: provider === 'app_store' ? 'App Store Connect Sandbox' : 'Google Play Sandbox',
          last_error: null,
          last_synced_at: iso,
          settings: {},
          updated_at: iso,
        },
      ];
    }
    saveDb(db);
    return { data: { days: 7, downloads: 184, purchases: 12, skippedCurrencies: [] }, status: 200 };
  }

  if (name === 'ai-advisor') {
    const stats = summarizeDbMetrics(db, body.period_days ?? 30);
    const profit = stats.revenue - stats.fees - stats.adSpend;
    if (body.mode === 'plan') {
      const planId = uid('plan');
      const plan = {
        id: planId,
        user_id: SUPERUSER_ID,
        created_at: iso,
        period_days: body.period_days ?? 30,
        focus: body.focus ?? null,
        summary: `Over the last ${body.period_days ?? 30} days your workspace recorded $${stats.revenue.toFixed(2)} revenue and $${profit.toFixed(2)} net profit across ${stats.downloads} downloads. Focus this week on lifting checkout conversion and scaling your positive-ROAS campaigns.`,
        missing_data: [],
        context: { includes_sample: db.daily_metrics.some((r) => r.source === 'sample') },
        model: 'Claude 4.5 Sonnet (Superuser)',
        updated_at: iso,
      };
      const steps = [
        {
          id: uid('step'),
          plan_id: planId,
          user_id: SUPERUSER_ID,
          position: 1,
          title: 'Promote high-margin yearly subscription on pricing step',
          detail: 'Locking in annual billing improves payback speed relative to ad spend.',
          based_on: `$${stats.revenue.toFixed(2)} period revenue and ${stats.purchases} purchases`,
          effort: 'small',
          status: 'suggested',
        },
        {
          id: uid('step'),
          plan_id: planId,
          user_id: SUPERUSER_ID,
          position: 2,
          title: 'Audit onboarding funnel drop-off before paywall',
          detail: 'Tighten time-to-first-value so more than 5% of new downloads convert.',
          based_on: `${stats.downloads} downloads vs ${stats.purchases} purchases`,
          effort: 'medium',
          status: 'suggested',
        },
        {
          id: uid('step'),
          plan_id: planId,
          user_id: SUPERUSER_ID,
          position: 3,
          title: 'Re-run security headers & secret scan before launch week',
          detail: 'Confirm zero VITE_ leaks and export CSP headers from Legal & Security.',
          based_on: 'Production readiness checklist',
          effort: 'small',
          status: 'suggested',
        },
      ];
      db.advisor_plans.unshift(plan);
      db.plan_steps.push(...steps);
      saveDb(db);
      return { data: { plan: { ...plan, plan_steps: steps } }, status: 200 };
    }

    const lastPrompt = body.messages?.at(-1)?.content ?? '';
    return {
      data: {
        reply: `Based on your current ${body.period_days ?? 30}-day workspace numbers ($${stats.revenue.toFixed(2)} revenue, $${profit.toFixed(2)} net profit, ${stats.downloads} downloads, ${stats.purchases} purchases):\n\nRegarding “${lastPrompt.slice(0, 80)}”: your unit economics remain profitable, with Apple Search and Meta delivering strong returns. Keep acquisition CAC below 40% of first-period revenue and export a Legal & Security snapshot before scaling spend further.`,
      },
      status: 200,
    };
  }

  if (name === 'legal-docs') {
    const kind = body.kind ?? 'privacy';
    const inputs = body.inputs ?? {};
    const draft = buildDeterministicDraft(kind, inputs);
    const saved = {
      id: uid('doc'),
      user_id: SUPERUSER_ID,
      kind,
      title: draft.title,
      inputs: { ...inputs, docKind: kind },
      sections: draft.sections,
      model: 'Claude 4.5 Sonnet (Superuser)',
      created_at: iso,
      updated_at: iso,
    };
    db.legal_documents.unshift(saved);
    saveDb(db);
    return { data: { document: saved }, status: 200 };
  }

  if (name === 'handoffs') {
    const title = body.title || 'Condensed Conversation Handoff';
    const messageCount = Array.isArray(body.messages) ? body.messages.length : 0;
    const saved = {
      id: uid('hoff'),
      user_id: SUPERUSER_ID,
      title: String(title).slice(0, 200),
      source: body.source ?? 'other',
      method: 'ai',
      conversation_date: body.conversation_date ? new Date(body.conversation_date).toISOString().slice(0, 10) : isoDayOffset(0),
      message_count: messageCount,
      model: 'Claude 4.5 Sonnet (Superuser)',
      sections: SECTIONS.map((s) => ({
        key: s.key,
        heading: s.heading,
        body: `Summary generated for ${title} (${messageCount} messages analyzed) under ${s.heading}.`,
      })),
      created_at: iso,
      updated_at: iso,
    };
    db.handoffs.unshift(saved);
    saveDb(db);
    return { data: { handoff: saved }, status: 200 };
  }

  if (name === 'engine') {
    return handleEngineFunction(body, db);
  }

  if (name === 'community-feed') {
    if (realClient) {
      try {
        const { data, error } = await realClient.functions.invoke('community-feed', { body, signal: opts?.signal });
        if (!error && data?.items?.length) return { data, status: 200 };
      } catch {
        // fall through to curated feed
      }
    }
    const items = [
      {
        id: 'hn:demo1',
        source: 'hn',
        community: 'Hacker News',
        title: 'Show HN: Running local Ollama + WebGPU models alongside cloud fallbacks',
        url: 'https://news.ycombinator.com',
        comments_url: 'https://news.ycombinator.com',
        points: 248,
        comments: 64,
        created_at: iso,
      },
      {
        id: 'rd:demo2',
        source: 'reddit',
        community: 'r/SideProject',
        title: 'How I passed App Store PrivacyInfo.xcprivacy review on the first try',
        url: 'https://www.reddit.com/r/SideProject/',
        comments_url: 'https://www.reddit.com/r/SideProject/',
        points: 185,
        comments: 39,
        created_at: iso,
      },
      {
        id: 'hn:demo3',
        source: 'hn',
        community: 'Hacker News',
        title: 'Automated CVE & secret scanning inside indie CI workflows',
        url: 'https://news.ycombinator.com',
        comments_url: 'https://news.ycombinator.com',
        points: 142,
        comments: 27,
        created_at: iso,
      },
    ];
    return { data: { items, sources: { hn: 'ok', reddit: 'ok' } }, status: 200 };
  }

  if (name === 'newsletter') {
    if (body.action === 'subscribe') {
      db.newsletter_subscribers = [{
        user_id: SUPERUSER_ID,
        status: 'active',
        include_numbers: body.include_numbers !== false,
        confirm_sent_at: iso,
        confirmed_at: iso,
      }];
      saveDb(db);
      return { data: { status: 'active' }, status: 200 };
    }
    return { data: { ok: true }, status: 200 };
  }

  if (name === 'weekly-digest') {
    if (body.action === 'preview') {
      return {
        data: {
          subject: 'Weekly Vibe · Superuser Digest',
          html: '<div style="font-family:sans-serif;padding:24px;"><h2>Weekly Vibe Digest</h2><p>Your sandbox workspace is running with full Admin Premium access.</p></div>',
          owner: true,
          ready: true,
        },
        status: 200,
      };
    }
    if (body.action === 'test_send') {
      return { data: { to: SUPERUSER_USER.email }, status: 200 };
    }
  }

  return { data: { ok: true }, status: 200 };
}
