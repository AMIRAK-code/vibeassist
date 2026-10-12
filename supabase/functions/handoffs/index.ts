// Context Handoffs, for the signed-in user.
//
// POST { action: 'condense', source, title?, conversation_date?, messages: [{ role, text }] }
//   -> { handoff }
// Condenses a chat into a handoff with the user's AI and saves the handoff. The chat arrives
// already trimmed and redacted by the browser; it's cleaned again here, sent to the AI, and
// then forgotten. Nothing of it is stored or logged.
//
// Handoffs the user's own AI wrote ("Ask your AI to write it") are saved straight from the
// browser, and share links go through create_handoff_link / get_shared_handoff in the database.
// Uses the AI chosen under Engine AI, else VibeAssist's ANTHROPIC_API_KEY (and ENGINE_MODEL).
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, projectKey } from '../_shared/http.ts';
import { anthropicFailure, DAILY_LIMIT } from '../_shared/ai.ts';
import { resolveAi, structuredCall } from '../_shared/engineAi.ts';
import { redactText } from '../_shared/handoff/redact.js';
import {
  budgetMessages, cleanMessages, cleanTitle, CONDENSE_INSTRUCTIONS, CONDENSE_SCHEMA, fromAnswer, LIMITS, renderTranscript, sourceLabel, SOURCES,
} from '../_shared/handoff/format.js';

const { sharedPerDay: SHARED_KEY_PER_DAY, ownPerDay: OWN_KEY_PER_DAY, premiumHandoffs: PREMIUM_HANDOFFS } = LIMITS;

const toIso = (value: unknown) => {
  const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(url, projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authError } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (authError || !user) return json({ error: 'Sign in first.' }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }
  if (body.action !== 'condense') return json({ error: 'Unknown action.' }, 400);

  const messages = cleanMessages(body.messages);
  if (!messages.length) return json({ error: 'Add a conversation first.' }, 400);
  if (messages.reduce((n, m) => n + m.text.length, 0) > LIMITS.requestChars) {
    return json({ error: 'That conversation is too long to send in one go. Pick a shorter one, or use "Ask your AI to write it".' }, 413);
  }
  const source = SOURCES.some((s) => s.value === body.source) ? body.source : 'other';

  // Bypasses RLS: only used for this user's rows, after the checks above
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const [{ data: premium }, { count: saved }] = await Promise.all([
    db.rpc('has_premium'),
    admin.from('handoffs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ]);
  const keep = premium ? PREMIUM_HANDOFFS : LIMITS.freeHandoffs;
  if ((saved ?? 0) >= keep) {
    return json({
      error: premium
        ? `You have ${PREMIUM_HANDOFFS} handoffs. Delete some you no longer need first.`
        : `Free accounts keep ${LIMITS.freeHandoffs} handoffs. Delete one, or go Premium for unlimited handoffs and share links.`,
      code: 'limit',
    }, 403);
  }

  const resolved = await resolveAi(admin, user.id);
  if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
  const ai = resolved.ai;

  const since = new Date(Date.now() - 864e5).toISOString();
  if (ai.ownKey) {
    const { count } = await admin.from('handoffs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('method', 'ai').gte('created_at', since);
    if ((count ?? 0) >= OWN_KEY_PER_DAY) return json({ error: `You've condensed ${OWN_KEY_PER_DAY} chats in the last 24 hours. Try again tomorrow.` }, 429);
  } else {
    const [{ count: handoffRuns }, { count: allRuns }] = await Promise.all([
      admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('feature', 'handoff').gte('created_at', since),
      admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since),
    ]);
    if ((handoffRuns ?? 0) >= SHARED_KEY_PER_DAY) {
      return json({ error: `You've used the ${SHARED_KEY_PER_DAY} condensed handoffs a day that run on VibeAssist's AI. "Ask your AI to write it" has no limit, and Premium accounts can use their own AI key.` }, 429);
    }
    if ((allRuns ?? 0) >= DAILY_LIMIT) return json({ error: `You've used all ${DAILY_LIMIT} AI requests for the last 24 hours. Try again tomorrow.` }, 429);
  }

  // Cleaned again here: the browser already did, but this is exactly what reaches the AI
  const cleaned = messages.map((m) => ({ role: m.role, text: redactText(m.text).text }));
  const transcript = renderTranscript(budgetMessages(cleaned).messages)
    .replace(/<\/?transcript/gi, (tag) => tag.replace('<', '‹')); // the chat can't close its own block
  const chatTitle = cleanTitle(redactText(body.title ?? '').text, '');

  let result;
  try {
    result = await structuredCall<Record<string, string>>(
      ai, admin, user.id,
      [CONDENSE_INSTRUCTIONS, `<transcript source="${sourceLabel(source)}"${chatTitle ? ` title="${chatTitle.replace(/"/g, "'")}"` : ''}>\n${transcript}\n</transcript>`],
      'Write the handoff for this conversation.',
      CONDENSE_SCHEMA,
      { feature: 'handoff' },
    );
  } catch (error) {
    // Errors from the user's own key are already worded for them
    if (ai.ownKey) return json({ error: String((error as Error)?.message ?? error).slice(0, 300) }, 502);
    const failure = anthropicFailure(error, 'handoff writer');
    if (failure) return failure;
    console.error('Condensing failed', (error as Error)?.name ?? 'unknown error');
    return json({ error: 'Something went wrong on our side. Nothing was saved. Try again.' }, 500);
  }
  if (result.refused) return json({ error: 'The AI declined to summarise this conversation. Nothing was saved.' }, 422);
  if (!result.data) {
    return json({ error: "The AI's answer didn't come back as a handoff. Nothing was saved. Try again, or pick a newer model under Engine AI." }, 502);
  }

  // The answer is cleaned too, in case the AI repeated something the redaction couldn't spot
  const answer = fromAnswer(result.data);
  const sections = answer.sections.map((s) => ({ ...s, body: redactText(s.body).text }));
  const title = redactText(answer.title === 'Untitled handoff' && chatTitle ? chatTitle : answer.title).text;
  const { data: handoff, error: saveError } = await admin.from('handoffs').insert({
    user_id: user.id,
    title,
    source,
    method: 'ai',
    sections,
    conversation_date: toIso(body.conversation_date),
    message_count: messages.length,
    model: String(result.model ?? '').slice(0, 100) || null,
  }).select().single();
  if (saveError) {
    console.error('Could not save the handoff', saveError.code);
    return json({ error: 'The handoff was written but could not be saved. Try again.' }, 500);
  }
  return json({ handoff });
});
