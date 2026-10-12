// How the Anti-Fragile Engine pays for AI. Under "Engine AI" users pick one of their own Smart
// Token Gateway keys (Anthropic, OpenAI, OpenRouter, Groq, Gemini, Mistral or DeepSeek) and a
// model; checks then use it, up to 50 AI runs a day. Otherwise they use VibeAssist's Claude key,
// capped at 8 AI runs a day and sharing the 30-request daily pool with the advisor. Users who
// never chose keep the earlier behaviour: their newest Anthropic gateway key, if they added one.
// The shared key's model is ENGINE_MODEL, or the advisor's model when that isn't set.
import { Anthropic, DAILY_LIMIT, MODEL, textOf } from './ai.ts';
import { PROVIDERS, type Provider } from './engine/gatewayRouting.ts';
import { jsonInstruction, parseJsonReply, providerProblem, responseFormats, toOpenAiContent, type UserContent } from './engine/aiFormats.ts';

export const OWN_KEY_RUNS_PER_DAY = 50;
export const SHARED_KEY_RUNS_PER_DAY = 8;

export type EngineAi = {
  provider: Provider;
  label: string;          // "OpenAI", or "VibeAssist" for the shared key
  model: string;
  ownKey: boolean;
  keyId: string | null;   // the gateway key, to record when it was last used or failed
  apiKey: string;
  anthropic: Anthropic | null;
};
type Result<T> = { data: T | null; refused: boolean; model: string };

// The key the user chose, or the newest Anthropic key if they never chose
// deno-lint-ignore no-explicit-any
async function chosenKey(admin: any, userId: string) {
  const { data: setting } = await admin.from('engine_ai_settings').select('provider_key_id, model').eq('user_id', userId).maybeSingle();
  if (setting) {
    if (!setting.provider_key_id) return { row: null, model: null };
    const { data: row } = await admin.from('gateway_provider_keys').select('id, provider').eq('id', setting.provider_key_id).eq('user_id', userId).maybeSingle();
    return { row, model: (setting.model as string | null) ?? null };
  }
  const { data: rows } = await admin.from('gateway_provider_keys').select('id, provider').eq('user_id', userId).eq('provider', 'anthropic')
    .order('created_at', { ascending: false }).limit(1);
  return { row: rows?.[0] ?? null, model: null };
}

// deno-lint-ignore no-explicit-any
export async function engineAi(admin: any, userId: string): Promise<{ ai: EngineAi } | { error: string; status: number }> {
  const sharedModel = Deno.env.get('ENGINE_MODEL') || MODEL;
  const choice = await chosenKey(admin, userId);
  let provider: Provider = 'anthropic';
  let label = 'VibeAssist';
  let model = sharedModel;
  let apiKey: string | null = null;
  let keyId: string | null = null;
  if (choice.row && PROVIDERS[choice.row.provider as Provider]) {
    const { data: secret } = await admin.rpc('engine_secret_get', { p_name: `gateway_key:${choice.row.id}` });
    if (secret) {
      provider = choice.row.provider;
      label = PROVIDERS[provider].label;
      model = choice.model || (provider === 'anthropic' ? sharedModel : '');
      if (!model) return { error: `Pick a model for your ${label} key under Engine AI.`, status: 400 };
      apiKey = secret;
      keyId = choice.row.id;
    }
  }
  const ownKey = Boolean(apiKey);
  if (!apiKey) apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? null;
  if (!apiKey) return { error: 'not_configured', status: 503 };

  const since = new Date(Date.now() - 864e5).toISOString();
  const { count: aiRuns } = await admin
    .from('engine_runs').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).in('module', ['red_team', 'drift']).neq('trigger', 'action').gte('created_at', since);
  const cap = ownKey ? OWN_KEY_RUNS_PER_DAY : SHARED_KEY_RUNS_PER_DAY;
  if ((aiRuns ?? 0) >= cap) {
    return { error: ownKey ? `You've run ${cap} AI reviews in the last 24 hours. Try again tomorrow.` : `You've used the ${cap} AI reviews a day that come with Premium. Choose your own AI provider key under Engine AI for up to ${OWN_KEY_RUNS_PER_DAY}.`, status: 429 };
  }
  if (!ownKey) {
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
    if ((count ?? 0) >= DAILY_LIMIT) return { error: `You've used all ${DAILY_LIMIT} AI requests for the last 24 hours. Try again tomorrow.`, status: 429 };
  }
  const anthropic = PROVIDERS[provider].format === 'anthropic' ? new Anthropic({ apiKey, timeout: 300_000, maxRetries: 1 }) : null;
  return { ai: { provider, label, model, ownKey, keyId, apiKey, anthropic } };
}

// One structured call, answered as JSON matching `schema`, through whichever provider the user chose
// deno-lint-ignore no-explicit-any
export async function structuredCall<T>(ai: EngineAi, admin: any, userId: string, system: string[], user: UserContent, schema: object): Promise<Result<T>> {
  try {
    const result = ai.anthropic ? await anthropicCall<T>(ai, admin, userId, system, user, schema) : await openAiCall<T>(ai, system, user, schema);
    if (ai.keyId) await admin.from('gateway_provider_keys').update({ last_used_at: new Date().toISOString(), last_error: null }).eq('id', ai.keyId);
    return result;
  } catch (error) {
    if (ai.keyId) await admin.from('gateway_provider_keys').update({ last_error: String((error as Error)?.message ?? error).slice(0, 300) }).eq('id', ai.keyId);
    throw error;
  }
}

// Claude, through the SDK. Streams so a long review doesn't hit the request timeout.
// deno-lint-ignore no-explicit-any
async function anthropicCall<T>(ai: EngineAi, admin: any, userId: string, system: string[], user: UserContent, schema: object): Promise<Result<T>> {
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await ai.anthropic!.beta.messages
      .stream({
        model: ai.model,
        max_tokens: 12000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
        system: system.map((text) => ({ type: 'text' as const, text })),
        messages: [{ role: 'user', content: user as Anthropic.Beta.BetaMessageParam['content'] }],
      })
      .finalMessage();
  } catch (error) {
    if (!ai.ownKey) throw error;
    if (error instanceof Anthropic.APIConnectionError) throw new Error('Anthropic couldn\'t be reached. Try again.');
    if (error instanceof Anthropic.APIError) throw new Error(providerProblem('Anthropic', ai.model, error.status ?? 0, error.message));
    throw error;
  }
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
  return { data: parseJsonReply<T>(textOf(message)), refused: false, model: message.model };
}

// OpenAI-compatible chat completions (OpenAI, OpenRouter, Groq, Gemini, Mistral, DeepSeek).
// Not every provider or model supports JSON-schema output, so a rejected format falls back to
// plain JSON mode with the schema in the instructions, then to no format at all.
async function openAiCall<T>(ai: EngineAi, system: string[], user: UserContent, schema: object): Promise<Result<T>> {
  const url = `${PROVIDERS[ai.provider].base}/chat/completions`;
  let status = 0;
  let detail = '';
  for (const format of responseFormats(schema)) {
    const instructions = format?.type === 'json_schema' ? system : [...system, jsonInstruction(schema)];
    const body: Record<string, unknown> = {
      model: ai.model,
      messages: [{ role: 'system', content: instructions.join('\n\n') }, { role: 'user', content: toOpenAiContent(user) }],
    };
    if (format) body.response_format = format;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      });
    } catch (error) {
      throw new Error((error as Error)?.name === 'TimeoutError' ? `${ai.label} took longer than 5 minutes to answer. Try a pull request or narrower review paths.` : `${ai.label} couldn't be reached. Try again.`);
    }
    // deno-lint-ignore no-explicit-any
    const data: any = await res.json().catch(() => null);
    if (res.ok) {
      const choice = data?.choices?.[0];
      const message = choice?.message ?? {};
      const refused = Boolean(message.refusal) || choice?.finish_reason === 'content_filter';
      const text = typeof message.content === 'string' ? message.content
        // deno-lint-ignore no-explicit-any
        : Array.isArray(message.content) ? message.content.map((part: any) => part?.text ?? '').join('') : '';
      return { data: refused ? null : parseJsonReply<T>(text), refused, model: data?.model ?? ai.model };
    }
    status = res.status;
    detail = String(data?.error?.message ?? (Array.isArray(data) ? data[0]?.error?.message : '') ?? '');
    // Only a rejected request is worth retrying with a simpler format
    if (status !== 400 && status !== 422) break;
  }
  throw new Error(providerProblem(ai.label, ai.model, status, detail));
}
