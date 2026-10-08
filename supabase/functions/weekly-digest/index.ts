// Sends the Weekly Vibe: this week's top threads and AI news, plus each subscriber's own numbers.
//
// POST { action: 'run' }        with header x-cron-secret: CRON_SECRET (the Monday cron job), or an owner's session
//   -> 202; creates this week's issue once and sends it in batches of 100. Safe to call again:
//      every subscriber gets at most one email per week.
// POST { action: 'preview' }    (signed in) -> { subject, html, text, owner } built from your own numbers
// POST { action: 'test_send' }  (owner)     -> sends the preview to your own address with "[Test]"
//
// Deploy with JWT checks off (the cron job has no user session); auth is checked here.
// Secrets: RESEND_API_KEY, NEWSLETTER_FROM, CRON_SECRET, NEWSLETTER_OWNER_EMAILS (comma separated), SITE_URL.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, projectKey } from '../_shared/http.ts';
import { buildFeed, type FeedItem, type FeedName, type RedditCredentials } from '../_shared/feeds.ts';
import { renderDigest, weekStart, type IssueContent, type Payload } from '../_shared/newsletter.ts';
import { pause, ResendError, sendBatch, sendEmail, type Email } from '../_shared/resend.ts';
import { BUSINESS, businessReady } from '../_shared/business.js';

const BATCH = 100;
const RUN_BUDGET_MS = 90_000;
const MAX_PER_RUN = 1000;
const FRESH_MS = 6 * 60 * 60 * 1000; // a feed under 6 hours old is fine for a weekly email

const siteUrl = () => (Deno.env.get('SITE_URL') ?? 'https://vibeassist.assist365.app').replace(/\/$/, '');
const owners = () => (Deno.env.get('NEWSLETTER_OWNER_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function redditCredentials(): RedditCredentials | null {
  const clientId = Deno.env.get('REDDIT_CLIENT_ID');
  const clientSecret = Deno.env.get('REDDIT_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, userAgent: Deno.env.get('REDDIT_USER_AGENT') ?? 'web:app.assist365.vibeassist:1.0' };
}

// deno-lint-ignore no-explicit-any
async function feedItems(admin: any, feed: FeedName): Promise<FeedItem[]> {
  const { data: cached } = await admin.from('feed_cache').select('items, sources, fetched_at').eq('feed', feed).maybeSingle();
  if (cached?.items?.length && Date.now() - new Date(cached.fetched_at).getTime() < FRESH_MS) return cached.items;
  try {
    const built = await buildFeed(feed, redditCredentials(), cached ? { items: cached.items ?? [], sources: cached.sources ?? {} } : null);
    if (built.items.length) {
      await admin.from('feed_cache').upsert({ feed, items: built.items, sources: built.sources, fetched_at: new Date().toISOString(), refreshing_until: null });
      return built.items;
    }
  } catch (error) {
    console.error(`Could not refresh ${feed} for the digest`, error);
  }
  return cached?.items ?? [];
}

function links(token: string) {
  const site = siteUrl();
  return {
    site,
    unsubscribe: `${site}/newsletter/unsubscribe?t=${token}`,
    manage: `${site}/settings#newsletter`,
    privacy: `${site}/privacy`,
  };
}

function buildEmail(content: IssueContent, row: { email: string; payload: Payload }, from: string, functionsUrl: string): Email {
  const message = renderDigest(content, row.payload, row.email, links(row.payload.unsubscribe_token), BUSINESS);
  return {
    from,
    to: [row.email],
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: {
      'List-Unsubscribe': `<${functionsUrl}/newsletter?t=${row.payload.unsubscribe_token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

// deno-lint-ignore no-explicit-any
async function runIssue(admin: any, apiKey: string, from: string, functionsUrl: string) {
  const week = weekStart();
  const content: IssueContent = { week_start: week, threads: (await feedItems(admin, 'threads')).slice(0, 5), news: (await feedItems(admin, 'ai_news')).slice(0, 5) };
  const { data: issueId, error: enqueueError } = await admin.rpc('newsletter_enqueue', { p_week_start: week, p_content: content });
  if (enqueueError) throw enqueueError;
  // A retry this week sends what was queued first, not a freshly fetched list
  const { data: issue } = await admin.from('newsletter_issues').select('content').eq('id', issueId).single();
  const issueContent = issue.content as IssueContent;

  const deadline = Date.now() + RUN_BUDGET_MS;
  let handled = 0;
  while (Date.now() < deadline && handled < MAX_PER_RUN) {
    const { data: batch, error: claimError } = await admin.rpc('newsletter_claim', { p_issue: issueId, p_limit: BATCH });
    if (claimError) throw claimError;
    if (!batch?.length) break;
    handled += batch.length;
    const emails = batch.map((row: { email: string; payload: Payload }) => buildEmail(issueContent, row, from, functionsUrl));
    try {
      await sendBatch(apiKey, emails, `weekly-vibe:${issueId}:${batch[0].batch_key}`);
      await admin.from('newsletter_sends').update({ status: 'sent', error: null, updated_at: new Date().toISOString() })
        .eq('issue_id', issueId).eq('batch_key', batch[0].batch_key);
    } catch (error) {
      if (error instanceof ResendError && error.status === 429) break; // over the rate limit: the next cron run carries on
      if (error instanceof ResendError && error.status >= 400 && error.status < 500 && error.name !== 'concurrent_idempotent_requests') {
        await admin.from('newsletter_sends').update({ status: 'failed', error: `${error.status} ${error.name}`.slice(0, 200), updated_at: new Date().toISOString() })
          .eq('issue_id', issueId).eq('batch_key', batch[0].batch_key);
      }
      // Network errors and timeouts leave the batch "sending": it goes again later with the same key
      console.error('Weekly Vibe batch failed', error instanceof ResendError ? `${error.status} ${error.name}` : error);
      break;
    }
    await pause();
  }

  // Count where the issue stands; it's finished when nothing is left to send or retry
  const { data: rows } = await admin.from('newsletter_sends').select('status, attempts').eq('issue_id', issueId);
  const sent = (rows ?? []).filter((r: { status: string }) => r.status === 'sent').length;
  const failed = (rows ?? []).filter((r: { status: string; attempts: number }) => r.status === 'failed' && r.attempts >= 3).length;
  const open = (rows ?? []).filter((r: { status: string; attempts: number }) => r.status === 'queued' || r.status === 'sending' || (r.status === 'failed' && r.attempts < 3)).length;
  await admin.from('newsletter_issues').update({
    sent,
    failed,
    ...(open === 0 ? { status: failed && !sent ? 'failed' : 'sent', completed_at: new Date().toISOString() } : {}),
  }).eq('id', issueId);
  console.log(`Weekly Vibe ${week}: ${sent} sent, ${failed} failed, ${open} still to go`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const functionsUrl = `${url}/functions/v1`;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }

  const fromCron = sameSecret(req.headers.get('x-cron-secret') ?? '', Deno.env.get('CRON_SECRET') ?? '');
  let user: { id: string; email?: string } | null = null;
  if (!fromCron) {
    const authHeader = req.headers.get('Authorization') ?? '';
    const db = createClient(url, projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    user = data?.user ?? null;
    if (!user) return json({ error: 'Sign in first.' }, 401);
  }
  const isOwner = Boolean(user?.email && owners().includes(user.email.toLowerCase()));

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NEWSLETTER_FROM');
  const ready = Boolean(apiKey && from && businessReady(BUSINESS));

  if (body.action === 'run') {
    if (!fromCron && !isOwner) return json({ error: 'Only the scheduled job or the owner can send the newsletter.' }, 403);
    if (!ready) return json({ error: 'not_configured', detail: 'Add RESEND_API_KEY, NEWSLETTER_FROM and the business details first.' }, 503);
    EdgeRuntime.waitUntil(runIssue(admin, apiKey!, from!, functionsUrl).catch((error) => console.error('Weekly Vibe run failed', error)));
    return json({ started: true, week_start: weekStart() }, 202);
  }

  if (body.action === 'preview' || body.action === 'test_send') {
    if (!user?.email) return json({ error: 'Sign in first.' }, 401);
    const week = weekStart();
    const content: IssueContent = { week_start: week, threads: (await feedItems(admin, 'threads')).slice(0, 5), news: (await feedItems(admin, 'ai_news')).slice(0, 5) };
    const { data: subscriber } = await admin.from('newsletter_subscribers').select('include_numbers, unsubscribe_token').eq('user_id', user.id).maybeSingle();
    const includeNumbers = subscriber?.include_numbers ?? true;
    const { data: numbers } = includeNumbers ? await admin.rpc('newsletter_numbers', { p_user: user.id, p_week_start: week }) : { data: {} };
    const { data: profile } = await admin.from('profiles').select('name').eq('id', user.id).maybeSingle();
    const payload: Payload = { include_numbers: includeNumbers, unsubscribe_token: subscriber?.unsubscribe_token ?? '00000000-0000-0000-0000-000000000000', name: profile?.name, ...(numbers ?? {}) };

    if (body.action === 'preview') {
      return json({ ...renderDigest(content, payload, user.email, links(payload.unsubscribe_token), BUSINESS), owner: isOwner, ready });
    }
    if (!isOwner) return json({ error: 'Test sends are for the newsletter owner.' }, 403);
    if (!ready) return json({ error: 'not_configured' }, 503);
    const email = buildEmail(content, { email: user.email, payload }, from!, functionsUrl);
    try {
      await sendEmail(apiKey!, { ...email, subject: `[Test] ${email.subject}` });
    } catch (error) {
      console.error('Test send failed', error);
      return json({ error: "Resend didn't accept the test email. Check the API key and that the sending domain is verified." }, 502);
    }
    return json({ sent: true, to: user.email });
  }

  return json({ error: 'Unknown action.' }, 400);
});
