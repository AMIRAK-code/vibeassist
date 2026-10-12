// Translating the engine's Claude-shaped requests for OpenAI-compatible providers (OpenAI,
// OpenRouter, Groq, Gemini, Mistral, DeepSeek), and reading their answers back. Pure functions,
// so they're tested without calling anyone.

export type TextBlock = { type: 'text'; text: string };
export type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
export type UserContent = string | (TextBlock | ImageBlock)[];

// Anthropic content blocks -> OpenAI message parts (images become data URLs)
export function toOpenAiContent(content: UserContent) {
  if (typeof content === 'string') return content;
  return content.map((block) => block.type === 'image'
    ? { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } }
    : { type: 'text', text: block.text });
}

// For providers without JSON-schema output: the schema goes into the instructions instead.
// (DeepSeek's JSON mode also requires the word "JSON" in the prompt.)
export function jsonInstruction(schema: object) {
  return `Reply with one JSON object only, no prose and no code fences, that matches this JSON Schema:\n${JSON.stringify(schema)}`;
}

// Models sometimes wrap JSON in fences or a sentence; take the outermost object
export function parseJsonReply<T>(text: string | null | undefined): T | null {
  if (!text) return null;
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  for (const candidate of [unfenced, unfenced.slice(unfenced.indexOf('{'), unfenced.lastIndexOf('}') + 1)]) {
    if (!candidate) continue;
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// A provider's error, in words the user can act on
export function providerProblem(label: string, model: string, status: number, message = '') {
  const detail = message ? ` (${message.slice(0, 160)})` : '';
  if (status === 401 || status === 403) return `${label} rejected your API key. Check it in the Smart Token Gateway.`;
  if (status === 404) return `${label} doesn't recognise the model "${model}". Check the model name in Engine AI.${detail}`;
  if (status === 429) return `${label} is rate-limiting your key right now. Wait a minute and try again.`;
  if (status === 402) return `${label} says your account is out of credit.${detail}`;
  if (status >= 500) return `${label} had a problem on its side (${status}). Try again in a few minutes.`;
  return `${label} couldn't do this review (${status})${detail}`;
}

// Response formats to try, best first: strict schema, then plain JSON mode, then none
export function responseFormats(schema: object, name = 'result') {
  return [
    { type: 'json_schema', json_schema: { name, schema, strict: false } },
    { type: 'json_object' },
    null,
  ];
}
