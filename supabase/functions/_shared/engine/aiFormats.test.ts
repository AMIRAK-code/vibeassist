import { describe, expect, it } from 'vitest';
import { jsonInstruction, parseJsonReply, providerProblem, responseFormats, toOpenAiContent } from './aiFormats.ts';

describe('toOpenAiContent', () => {
  it('passes plain text through', () => {
    expect(toOpenAiContent('Review this.')).toBe('Review this.');
  });

  it('turns Claude image blocks into data URLs and keeps the order', () => {
    const parts = toOpenAiContent([
      { type: 'text', text: 'Screenshot: / @ 390px' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
      { type: 'text', text: 'Check it.' },
    ]);
    expect(parts).toEqual([
      { type: 'text', text: 'Screenshot: / @ 390px' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
      { type: 'text', text: 'Check it.' },
    ]);
  });
});

describe('parseJsonReply', () => {
  it('reads a bare object', () => {
    expect(parseJsonReply('{"ok":true}')).toEqual({ ok: true });
  });

  it('reads an object inside code fences', () => {
    expect(parseJsonReply('```json\n{"findings":[]}\n```')).toEqual({ findings: [] });
  });

  it('reads an object surrounded by prose', () => {
    expect(parseJsonReply('Here is the review:\n{"summary":"fine","findings":[]}\nThanks!')).toEqual({ summary: 'fine', findings: [] });
  });

  it('rejects empty answers, arrays and broken JSON', () => {
    expect(parseJsonReply('')).toBeNull();
    expect(parseJsonReply(null)).toBeNull();
    expect(parseJsonReply('[1,2]')).toBeNull();
    expect(parseJsonReply('{"summary": "cut off')).toBeNull();
  });
});

describe('responseFormats', () => {
  it('tries a JSON schema first, then JSON mode, then nothing', () => {
    const schema = { type: 'object' };
    const formats = responseFormats(schema, 'review');
    expect(formats[0]).toEqual({ type: 'json_schema', json_schema: { name: 'review', schema, strict: false } });
    expect(formats[1]).toEqual({ type: 'json_object' });
    expect(formats[2]).toBeNull();
  });

  it('puts the schema and the word JSON into the fallback instructions', () => {
    const text = jsonInstruction({ type: 'object', required: ['ok'] });
    expect(text).toMatch(/JSON/);
    expect(text).toContain('"required":["ok"]');
  });
});

describe('providerProblem', () => {
  it('explains the usual failures in plain words', () => {
    expect(providerProblem('OpenAI', 'gpt-x', 401)).toMatch(/rejected your API key/);
    expect(providerProblem('Groq', 'llama-x', 404, 'model not found')).toMatch(/doesn't recognise the model "llama-x"/);
    expect(providerProblem('Mistral', 'm', 429)).toMatch(/rate-limiting/);
    expect(providerProblem('Gemini', 'g', 503)).toMatch(/on its side \(503\)/);
  });
});
