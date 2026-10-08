// Weekly Vibe subscriptions with double opt-in.
//
// POST { action: 'subscribe', include_numbers }  (signed in) -> { status: 'pending' | 'active', email }
//   Emails a confirm link (at most once every 10 minutes). Needs RESEND_API_KEY.
// POST { action: 'confirm', token }      -> { status: 'active' }        (from /newsletter/confirm)
// POST { action: 'unsubscribe', token }  -> { status: 'unsubscribed' }  (from /newsletter/unsubscribe)
// POST ?t=<unsubscribe token> with body "List-Unsubscribe=One-Click"     (RFC 8058, from mail apps)
//
// Deploy with JWT checks off: confirm and unsubscribe links work without signing in, and the
// subscribe action checks the session itself.
// Secrets: RESEND_API_KEY, NEWSLETTER_FROM (e.g. "The Weekly Vibe <newsletter@assist365.app>"), SITE_URL.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, projectKey } from '../_shared/http.ts';
import { CONSENT_TEXT, renderConfirm } from '../_shared/newsletter.ts';
import { ResendError, sendEmail } from '../_shared/resend.ts';
import { BUSINESS, businessReady } from '../_shared/business.js';

const CONFIRM_DAYS = 7;
const RESEND_EVERY_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const siteUrl = () => (Deno.env.get('SITE_URL') ?? 'https://vibeassist.assist365.app').replace(/\/$/, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  // One-click unsubscribe from a mail app's own button (RFC 8058): a form POST, no page
  const oneClickToken = new URL(req.url).searchParams.get('t');
  if (oneClickToken) {
    const form = await req.text();
    if (!form.includes('List-Unsubscribe=One-Click') || !UUID.test(oneClickToken)) return new Response('Bad request', { status: 400 });
    await admin
      .from('newsletter_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString(), confirm_token_hash: null })
      .eq('unsubscribe_token', oneClickToken)
      .in('status', ['pending', 'active']);
    return new Response('Unsubscribed', { status: 200 });
  }

  let body: { action?: string; token?: string; include_numbers?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }

  if (body.action === 'confirm') {
    const token = String(body.token ?? '');
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'This confirmation link is incomplete. Open it from the email again.' }, 400);
    const { data, error } = await admin
      .from('newsletter_subscribers')
      .update({ status: 'active', confirmed_at: new Date().toISOString(), confirm_token_hash: null })
      .eq('confirm_token_hash', await sha256(token))
      .eq('status', 'pending')
      .gte('confirm_sent_at', new Date(Date.now() - CONFIRM_DAYS * 864e5).toISOString())
      .select('status');
    if (error) return json({ error: 'Could not confirm right now. Try again.' }, 500);
    if (!data?.length) return json({ error: 'This link has expired or was already used. Subscribe again from News & Newsletter.' }, 400);
    return json({ status: 'active' });
  }

  if (body.action === 'unsubscribe') {
    const token = String(body.token ?? '');
    if (!UUID.test(token)) return json({ error: 'This unsubscribe link is incomplete. Open it from the email again.' }, 400);
    const { data, error } = await admin
      .from('newsletter_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString(), confirm_token_hash: null })
      .eq('unsubscribe_token', token)
      .select('status');
    if (error) return json({ error: 'Could not unsubscribe right now. Try again.' }, 500);
    if (!data?.length) return json({ error: "We couldn't find this subscription. It may already have been removed." }, 404);
    return json({ status: 'unsubscribed' });
  }

  if (body.action !== 'subscribe') return json({ error: 'Unknown action.' }, 400);

  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(url, projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authError } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (authError || !user?.email) return json({ error: 'Sign in to subscribe.' }, 401);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NEWSLETTER_FROM');
  if (!apiKey || !from || !businessReady(BUSINESS)) return json({ error: 'not_configured' }, 503);

  const { data: existing } = await admin
    .from('newsletter_subscribers')
    .select('status, confirm_sent_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing?.status === 'active') {
    await admin.from('newsletter_subscribers').update({ include_numbers: body.include_numbers !== false }).eq('user_id', user.id);
    return json({ status: 'active', email: user.email });
  }
  if (existing?.status === 'pending' && existing.confirm_sent_at && Date.now() - new Date(existing.confirm_sent_at).getTime() < RESEND_EVERY_MS) {
    return json({ status: 'pending', email: user.email, wait: true });
  }

  const token = randomToken();
  const now = new Date().toISOString();
  const { error: saveError } = await admin.from('newsletter_subscribers').upsert({
    user_id: user.id,
    status: 'pending',
    include_numbers: body.include_numbers !== false,
    confirm_token_hash: await sha256(token),
    confirm_sent_at: now,
    consent_text: CONSENT_TEXT,
    requested_at: now,
    unsubscribed_at: null,
  }, { onConflict: 'user_id' });
  if (saveError) {
    console.error('Could not save the subscription', saveError);
    return json({ error: 'Could not subscribe right now. Try again.' }, 500);
  }

  const message = renderConfirm(`${siteUrl()}/newsletter/confirm?token=${token}`, user.email, BUSINESS);
  try {
    await sendEmail(apiKey, { from, to: [user.email], subject: message.subject, html: message.html, text: message.text });
  } catch (error) {
    console.error('Confirmation email failed', error instanceof ResendError ? `${error.status} ${error.name}` : error);
    await admin.from('newsletter_subscribers').update({ confirm_sent_at: null }).eq('user_id', user.id);
    return json({ error: "We couldn't send the confirmation email. Try again in a few minutes." }, 502);
  }
  return json({ status: 'pending', email: user.email });
});
