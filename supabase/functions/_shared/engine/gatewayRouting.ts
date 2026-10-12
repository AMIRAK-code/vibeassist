// Smart Token Gateway: the providers it can call, when to fall back to the next target, and
// how to read token usage from a reply or a stream. Only these hosts are ever called.

export type ApiFormat = 'openai' | 'anthropic';
export type Provider = 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'gemini' | 'mistral' | 'deepseek';

export const PROVIDERS: Record<Provider, { label: string; format: ApiFormat; base: string }> = {
  anthropic: { label: 'Anthropic', format: 'anthropic', base: 'https://api.anthropic.com/v1' },
  openai: { label: 'OpenAI', format: 'openai', base: 'https://api.openai.com/v1' },
  openrouter: { label: 'OpenRouter', format: 'openai', base: 'https://openrouter.ai/api/v1' },
  groq: { label: 'Groq', format: 'openai', base: 'https://api.groq.com/openai/v1' },
  gemini: { label: 'Google Gemini', format: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  mistral: { label: 'Mistral', format: 'openai', base: 'https://api.mistral.ai/v1' },
  deepseek: { label: 'DeepSeek', format: 'openai', base: 'https://api.deepseek.com/v1' },
};

export const ENDPOINTS: Record<ApiFormat, string> = { openai: '/chat/completions', anthropic: '/messages' };

// Rate limits, overloads and server errors move on to the next target; anything else (a bad
// request, a refused key) is returned as it is, because another provider wouldn't help
export const shouldFallback = (status: number) => status === 408 || status === 409 || status === 429 || status >= 500;

export function upstreamRequest(provider: Provider, key: string, body: Record<string, unknown>, model: string) {
  const config = PROVIDERS[provider];
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.format === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = `Bearer ${key}`;
  }
  const payload: Record<string, unknown> = { ...body, model };
  // Ask OpenAI-style streams to report token usage in their last chunk
  if (config.format === 'openai' && body.stream) payload.stream_options = { ...(body.stream_options as object ?? {}), include_usage: true };
  return { url: `${config.base}${ENDPOINTS[config.format]}`, init: { method: 'POST', headers, body: JSON.stringify(payload) } };
}

export function usageFromJson(format: ApiFormat, body: { usage?: Record<string, number> }) {
  const u = body?.usage ?? {};
  return format === 'anthropic'
    ? { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 }
    : { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0 };
}

// Reads usage out of a finished server-sent-events stream
export function usageFromStream(format: ApiFormat, text: string) {
  let input = 0;
  let output = 0;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const event = JSON.parse(data);
      if (format === 'anthropic') {
        if (event.type === 'message_start') input = usageFromJson('anthropic', event.message).input;
        if (event.type === 'message_delta' && event.usage) output = event.usage.output_tokens ?? output;
      } else if (event.usage) {
        input = event.usage.prompt_tokens ?? input;
        output = event.usage.completion_tokens ?? output;
      }
    } catch {
      // a partial line at the end of the stream
    }
  }
  return { input, output };
}

// Errors in the shape each SDK expects, so client libraries show the message properly
export function errorBody(format: ApiFormat, status: number, message: string) {
  return format === 'anthropic'
    ? { type: 'error', error: { type: status === 401 ? 'authentication_error' : status === 429 ? 'rate_limit_error' : status === 404 ? 'not_found_error' : 'api_error', message } }
    : { error: { message, type: status === 401 ? 'invalid_api_key' : status === 429 ? 'rate_limit_exceeded' : 'api_error', code: status } };
}

// A route's targets must use providers that speak the route's format
export function validateTargets(format: ApiFormat, targets: { provider: Provider; model: string }[]) {
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 4) return 'A route needs 1 to 4 targets.';
  for (const t of targets) {
    if (!PROVIDERS[t.provider]) return `Unknown provider ${t.provider}.`;
    if (PROVIDERS[t.provider].format !== format) return `${PROVIDERS[t.provider].label} doesn't speak the ${format === 'openai' ? 'OpenAI' : 'Anthropic'} format.`;
    if (!/^[A-Za-z0-9._:/-]{1,100}$/.test(t.model)) return 'Model names use letters, numbers and . _ : / - only.';
  }
  return null;
}
