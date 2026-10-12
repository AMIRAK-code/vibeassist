// How the Anti-Fragile Engine pays for Claude. If the user added their own Anthropic key to the
// Smart Token Gateway, engine reviews use it (up to 50 AI runs a day). Otherwise they use
// VibeAssist's key, capped at 8 AI runs a day and sharing the 30-request daily pool with the
// advisor. The model is ENGINE_MODEL, or the advisor's model when that isn't set.
import { Anthropic, DAILY_LIMIT, MODEL, textOf } from './ai.ts';

export const OWN_KEY_RUNS_PER_DAY = 50;
export const SHARED_KEY_RUNS_PER_DAY = 8;

export type EngineAi = { anthropic: Anthropic; model: string; ownKey: boolean };

// deno-lint-ignore no-explicit-any
export async function engineAi(admin: any, userId: string): Promise<{ ai: EngineAi } | { error: string; status: number }> {
  const model = Deno.env.get('ENGINE_MODEL') || MODEL;
  const { data: keys } = await admin
    .from('gateway_provider_keys').select('id').eq('user_id', userId).eq('provider', 'anthropic')
    .order('created_at', { ascending: false }).limit(1);
  let apiKey: string | null = null;
  let ownKey = false;
  if (keys?.length) {
    const { data: secret } = await admin.rpc('engine_secret_get', { p_name: `gateway_key:${keys[0].id}` });
    if (secret) {
      apiKey = secret;
      ownKey = true;
    }
  }
  if (!apiKey) apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? null;
  if (!apiKey) return { error: 'not_configured', status: 503 };

  const since = new Date(Date.now() - 864e5).toISOString();
  const { count: aiRuns } = await admin
    .from('engine_runs').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).in('module', ['red_team', 'drift']).neq('trigger', 'action').gte('created_at', since);
  const cap = ownKey ? OWN_KEY_RUNS_PER_DAY : SHARED_KEY_RUNS_PER_DAY;
  if ((aiRuns ?? 0) >= cap) {
    return { error: ownKey ? `You've run ${cap} AI reviews in the last 24 hours. Try again tomorrow.` : `You've used the ${cap} AI reviews a day that come with Premium. Add your own Anthropic key in the Smart Token Gateway for up to ${OWN_KEY_RUNS_PER_DAY}.`, status: 429 };
  }
  if (!ownKey) {
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
    if ((count ?? 0) >= DAILY_LIMIT) return { error: `You've used all ${DAILY_LIMIT} AI requests for the last 24 hours. Try again tomorrow.`, status: 429 };
  }
  return { ai: { anthropic: new Anthropic({ apiKey, timeout: 300_000, maxRetries: 1 }), model, ownKey } };
}

// One structured call. Streams so a long review doesn't hit the request timeout.
// deno-lint-ignore no-explicit-any
export async function structuredCall<T>(ai: EngineAi, admin: any, userId: string, system: string[], user: Anthropic.Beta.BetaMessageParam['content'], schema: object): Promise<{ data: T | null; refused: boolean; model: string }> {
  const message = await ai.anthropic.beta.messages
    .stream({
      model: ai.model,
      max_tokens: 12000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system: system.map((text) => ({ type: 'text' as const, text })),
      messages: [{ role: 'user', content: user }],
    })
    .finalMessage();
  // Only VibeAssist's own key counts against the shared daily pool
  if (!ai.ownKey) {
    const u = message.usage;
    await admin.from('ai_usage').insert({
      user_id: userId,
      model: message.model,
      feature: 'engine',
      input_tokens: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      output_tokens: u.output_tokens,
    });
  }
  if (message.stop_reason === 'refusal') return { data: null, refused: true, model: message.model };
  try {
    return { data: JSON.parse(textOf(message)) as T, refused: false, model: message.model };
  } catch {
    return { data: null, refused: false, model: message.model };
  }
}
