// Smart Token Gateway: one endpoint for the user's apps that routes LLM calls across their own
// provider keys, falling back to the next target on rate limits and outages.
//
//   POST {SUPABASE_URL}/functions/v1/gateway/v1/chat/completions   (OpenAI format)
//   POST {SUPABASE_URL}/functions/v1/gateway/v1/messages           (Anthropic format)
//   GET  {SUPABASE_URL}/functions/v1/gateway/v1/models
// Auth: "Authorization: Bearer va_…" or "x-api-key: va_…" (a gateway key). The request's
// "model" is one of the user's route aliases. Streaming is passed straight through.
//
// Deploy with JWT checks off: apps authenticate with gateway keys, checked here.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { projectKey } from '../_shared/http.ts';
import { type ApiFormat, errorBody, PROVIDERS, type Provider, shouldFallback, upstreamRequest, usageFromJson, usageFromStream } from '../_shared/engine/gatewayRouting.ts';

const MAX_BODY = 4 * 1024 * 1024;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type, anthropic-version, anthropic-beta',
};

const reply = (format: ApiFormat, status: number, message: string) =>
  new Response(JSON.stringify(errorBody(format, status, message)), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const path = new URL(req.url).pathname.replace(/^.*\/gateway/, '');
  const format: ApiFormat = path.endsWith('/messages') ? 'anthropic' : 'openai';

  const key = (req.headers.get('x-api-key') || (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')).trim();
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: begun, error: beginError } = await admin.rpc('gateway_begin', { p_key: key });
  if (beginError) {
    const message = String(beginError.message);
    if (message.includes('rate_limited_minute')) return reply(format, 429, 'Gateway limit reached: 60 requests a minute.');
    if (message.includes('rate_limited_day')) return reply(format, 429, 'Gateway limit reached: 5,000 requests a day.');
    return reply(format, 401, 'Invalid or revoked VibeAssist gateway key, or the account no longer has Premium.');
  }
  const { key_id: keyId, user_id: userId } = begun[0];

  if (req.method === 'GET' && path.endsWith('/models')) {
    const { data: routes } = await admin.from('gateway_routes').select('alias, api_format, created_at').eq('user_id', userId).order('alias');
    return new Response(JSON.stringify({
      object: 'list',
      data: (routes ?? []).map((r: { alias: string; api_format: string; created_at: string }) => ({ id: r.alias, object: 'model', created: Math.floor(new Date(r.created_at).getTime() / 1000), owned_by: `vibeassist:${r.api_format}` })),
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (req.method !== 'POST' || !(path.endsWith('/chat/completions') || path.endsWith('/messages'))) {
    return reply(format, 404, 'Use POST /v1/chat/completions, POST /v1/messages or GET /v1/models.');
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return reply(format, 413, 'Requests are limited to 4 MB.');

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply(format, 413, 'Requests are limited to 4 MB.');
    body = JSON.parse(raw);
  } catch {
    return reply(format, 400, 'Send a JSON body.');
  }
  const alias = String(body.model ?? '');
  const { data: route } = await admin.from('gateway_routes').select('*').eq('user_id', userId).eq('alias', alias).maybeSingle();
  if (!route) return reply(format, 404, `No route called "${alias}". Create it on the Anti-Fragile Engine page; "model" must be a route alias.`);
  if (route.api_format !== format) return reply(format, 400, `Route "${alias}" uses the ${route.api_format === 'openai' ? 'OpenAI (/v1/chat/completions)' : 'Anthropic (/v1/messages)'} format.`);

  const started = Date.now();
  const usage = { user_id: userId, api_key_id: keyId, route_alias: alias, streamed: Boolean(body.stream) } as Record<string, unknown>;
  const record = (extra: Record<string, unknown>) =>
    EdgeRuntime.waitUntil(admin.from('gateway_usage').insert({ ...usage, ...extra, latency_ms: Date.now() - started }).then(() => {}));

  let attempts = 0;
  let lastStatus = 502;
  let lastError = 'Every target failed.';
  for (const target of route.targets as { provider_key_id: string; provider: Provider; model: string }[]) {
    const { data: keyRow } = await admin.from('gateway_provider_keys').select('id, provider').eq('id', target.provider_key_id).eq('user_id', userId).maybeSingle();
    if (!keyRow || PROVIDERS[keyRow.provider as Provider]?.format !== format) continue;
    const { data: secret } = await admin.rpc('engine_secret_get', { p_name: `gateway_key:${keyRow.id}` });
    if (!secret) continue;
    const { url: upstreamUrl, init } = upstreamRequest(keyRow.provider as Provider, secret, body, target.model);
    // Pass through the Anthropic beta header if the app asked for one
    if (format === 'anthropic' && req.headers.get('anthropic-beta')) (init.headers as Record<string, string>)['anthropic-beta'] = req.headers.get('anthropic-beta')!;

    attempts++;
    for (let retry = 0; retry < 2; retry++) {
      let res: Response;
      try {
        res = await fetch(upstreamUrl, { ...init, signal: AbortSignal.timeout(route.timeout_ms) });
      } catch (error) {
        lastStatus = 504;
        lastError = `${PROVIDERS[keyRow.provider as Provider].label}: ${(error as Error).name === 'TimeoutError' ? 'timed out' : 'could not be reached'}`;
        break;
      }
      // One quick retry when the provider says it'll be ready within two seconds
      const wait = Number(res.headers.get('retry-after'));
      if ((res.status === 503 || res.status === 529) && retry === 0 && wait > 0 && wait <= 2) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (shouldFallback(res.status)) {
        lastStatus = res.status;
        lastError = `${PROVIDERS[keyRow.provider as Provider].label} answered ${res.status}`;
        await admin.from('gateway_provider_keys').update({ last_error: lastError }).eq('id', keyRow.id);
        break;
      }

      await admin.from('gateway_provider_keys').update({ last_used_at: new Date().toISOString(), ...(res.ok ? { last_error: null } : {}) }).eq('id', keyRow.id);
      const headers = { ...cors, 'Content-Type': res.headers.get('content-type') ?? 'application/json', 'x-vibeassist-provider': keyRow.provider, 'x-vibeassist-model': target.model };
      const base = { provider: keyRow.provider, model: target.model, status: res.status, attempts, fallback_used: attempts > 1 };

      if (body.stream && res.ok && res.body) {
        // Stream straight to the app; a copy is read in the background for token counts
        const [toClient, toCount] = res.body.tee();
        EdgeRuntime.waitUntil((async () => {
          const text = await new Response(toCount).text();
          const counted = usageFromStream(format, text);
          await admin.from('gateway_usage').insert({ ...usage, ...base, input_tokens: counted.input, output_tokens: counted.output, latency_ms: Date.now() - started });
        })());
        return new Response(toClient, { status: res.status, headers });
      }
      const text = await res.text();
      let counted = { input: 0, output: 0 };
      try {
        counted = usageFromJson(format, JSON.parse(text));
      } catch {
        // not JSON
      }
      record({ ...base, input_tokens: counted.input, output_tokens: counted.output, error: res.ok ? null : text.slice(0, 300) });
      return new Response(text, { status: res.status, headers });
    }
  }

  record({ status: lastStatus, attempts, fallback_used: attempts > 1, error: lastError.slice(0, 300) });
  return reply(format, attempts ? lastStatus : 503, attempts ? `${lastError}. No target could answer.` : `Route "${alias}" has no usable targets: check its provider keys.`);
});
