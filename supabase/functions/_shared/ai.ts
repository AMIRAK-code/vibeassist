// Shared rules for VibeAssist's Claude-backed functions: the model, the daily request cap
// (one pool for the advisor, the analyzer and the legal generator) and plain-language errors.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { json } from './http.ts';

export const MODEL = 'claude-opus-5-5';
export const DAILY_LIMIT = 30;

// deno-lint-ignore no-explicit-any
export async function requestsUsedToday(db: any) {
  const { count, error } = await db
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 864e5).toISOString());
  if (error) throw error;
  return count ?? 0;
}

// deno-lint-ignore no-explicit-any
export async function recordUsage(admin: any, userId: string, response: Anthropic.Beta.BetaMessage) {
  const usage = response.usage;
  const { error } = await admin.from('ai_usage').insert({
    user_id: userId,
    model: response.model,
    input_tokens: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    output_tokens: usage.output_tokens,
  });
  if (error) console.error('Failed to record AI usage', error);
}

export function textOf(response: Anthropic.Beta.BetaMessage) {
  return response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// Turns an Anthropic SDK error into a reply the user can act on; null if it isn't one
export function anthropicFailure(error: unknown, what: string) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error('Anthropic rejected the API key', error.message);
    return json({ error: `The ${what}'s Anthropic API key was rejected. Check the ANTHROPIC_API_KEY secret in Supabase.` }, 503);
  }
  if (error instanceof Anthropic.RateLimitError) return json({ error: `The ${what} is busy right now. Wait a minute and try again.` }, 429);
  if (error instanceof Anthropic.APIConnectionError) {
    console.error('Could not reach the Anthropic API', error.message);
    return json({ error: `The ${what} couldn't be reached. Check your connection and try again.` }, 502);
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${error.status}`, error.message);
    return json({ error: `The ${what} is unavailable right now. Try again in a few minutes.` }, 502);
  }
  return null;
}

export { Anthropic };
