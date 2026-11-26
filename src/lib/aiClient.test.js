import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDERS, buildProviderRequest, extractJsonFromAiText, maskApiKey, validateProviderKey,
} from './aiClient';

describe('validateProviderKey', () => {
  it('validates Gemini, Anthropic, OpenAI, and local Ollama configurations', () => {
    expect(validateProviderKey('gemini', 'AIzaSyDummyKey1234567890abcd')).toEqual({ ok: true, error: '', warning: '' });
    expect(validateProviderKey('anthropic', 'sk-ant-api03-1234567890abcdef')).toEqual({ ok: true, error: '', warning: '' });
    expect(validateProviderKey('openai', 'sk-proj-1234567890abcdef12345')).toEqual({ ok: true, error: '', warning: '' });

    // Local Ollama requires no API key
    expect(validateProviderKey('ollama', '', 'http://localhost:11434/v1')).toEqual({ ok: true, error: '', warning: '' });

    // Bad inputs fail clearly
    expect(validateProviderKey('openai', '').ok).toBe(false);
    expect(validateProviderKey('gemini', 'short').ok).toBe(false);
    expect(validateProviderKey('ollama', '', 'not-a-url').ok).toBe(false);

    // Unexpected prefix emits a helpful warning without blocking
    expect(validateProviderKey('gemini', 'custom_12345678901234567890').warning).toMatch(/AIza/);
  });

  it('masks API keys safely', () => {
    expect(maskApiKey('')).toBe('No key (local)');
    expect(maskApiKey('AIzaSyDummyKey1234567890abcd')).toBe('AIzaSyD…abcd');
  });
});

describe('buildProviderRequest & extractJsonFromAiText', () => {
  it('formats OpenAI-compatible and Anthropic requests accurately', () => {
    const geminiReq = buildProviderRequest(
      { provider: 'gemini', apiKey: 'AIzaTest', baseUrl: AI_PROVIDERS.gemini.baseUrl, defaultModel: 'gemini-2.5-flash' },
      { system: ['Be concise.'], messages: [{ role: 'user', content: 'Hi' }], jsonMode: true },
    );
    expect(geminiReq.url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(geminiReq.init.headers.Authorization).toBe('Bearer AIzaTest');
    expect(JSON.parse(geminiReq.init.body).response_format).toEqual({ type: 'json_object' });

    const claudeReq = buildProviderRequest(
      { provider: 'anthropic', apiKey: 'sk-ant-test', baseUrl: AI_PROVIDERS.anthropic.baseUrl, defaultModel: 'claude-sonnet-4-5' },
      { system: 'System prompt', messages: [{ role: 'user', content: 'Hello' }] },
    );
    expect(claudeReq.url).toBe('https://api.anthropic.com/v1/messages');
    expect(claudeReq.init.headers['x-api-key']).toBe('sk-ant-test');
    expect(claudeReq.init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('extracts JSON wrapped in thinking tags or markdown fences', () => {
    const raw = '<think>Analyzing...</think>\n```json\n{"ok": true, "steps": ["one"]}\n```';
    expect(extractJsonFromAiText(raw)).toEqual({ ok: true, steps: ['one'] });
  });
});
