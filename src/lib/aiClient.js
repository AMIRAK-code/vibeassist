import { useEffect, useState } from 'react';

const CONNECTIONS_KEY = 'vibeassist:ai-connections';
const ROUTING_KEY = 'vibeassist:ai-routing';
const CHANGE_EVENT = 'vibeassist:ai-changed';

export const AI_FEATURE_SLOTS = [
  { key: 'default', label: 'Platform Default', desc: 'Fallback used by any AI tool unless overridden below.' },
  { key: 'analyzer', label: 'AI Business Analyzer', desc: '90-day profit, LTV:CAC and pricing strategy Q&A.' },
  { key: 'plan', label: 'Weekly Plan', desc: 'Actionable weekly steps generated from your numbers.' },
  { key: 'legal', label: 'Legal Drafter', desc: 'Privacy policies, terms, EULAs, DPAs and AI notices.' },
  { key: 'security', label: 'Security Reviewer', desc: 'Code vulnerability, secret leak and RLS posture review.' },
  { key: 'handoffs', label: 'Context Handoffs', desc: 'Condense chat transcripts privately before exporting.' },
  { key: 'newsletter', label: 'News & Community Brief', desc: 'Summarize top Hacker News and indie-dev threads.' },
];

export const AI_PROVIDERS = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    category: 'top',
    format: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyPrefixHint: 'AIza',
    keyPlaceholder: 'AIzaSy…',
    requiresKey: true,
    local: false,
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
    docsUrl: 'https://aistudio.google.com/apikey',
    gatewayProvider: 'gemini',
    summary: 'Fast multimodal and long-context models via Google AI Studio.',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    category: 'top',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyPrefixHint: 'sk-ant-',
    keyPlaceholder: 'sk-ant-api03-…',
    requiresKey: true,
    local: false,
    models: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-3-5-haiku-latest'],
    defaultModel: 'claude-sonnet-4-5',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    gatewayProvider: 'anthropic',
    summary: 'Strong reasoning, coding and legal drafting with Claude.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    category: 'top',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyPrefixHint: 'sk-',
    keyPlaceholder: 'sk-proj-…',
    requiresKey: true,
    local: false,
    models: ['gpt-4.1', 'gpt-4.1-mini', 'o4-mini', 'gpt-4o'],
    defaultModel: 'gpt-4.1-mini',
    docsUrl: 'https://platform.openai.com/api-keys',
    gatewayProvider: 'openai',
    summary: 'GPT-4.1 and o4 reasoning models directly on your OpenAI key.',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    category: 'frontier',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPrefixHint: 'sk-or-',
    keyPlaceholder: 'sk-or-v1-…',
    requiresKey: true,
    local: false,
    models: ['anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro', 'deepseek/deepseek-r1'],
    defaultModel: 'anthropic/claude-sonnet-4.5',
    docsUrl: 'https://openrouter.ai/keys',
    gatewayProvider: 'openrouter',
    summary: 'One unified API key to route across dozens of frontier models.',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    category: 'frontier',
    format: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPrefixHint: 'gsk_',
    keyPlaceholder: 'gsk_…',
    requiresKey: true,
    local: false,
    models: ['llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b'],
    defaultModel: 'llama-3.3-70b-versatile',
    docsUrl: 'https://console.groq.com/keys',
    gatewayProvider: 'groq',
    summary: 'Ultra-low-latency Llama and DeepSeek inference on LPU hardware.',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    category: 'frontier',
    format: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    keyPrefixHint: 'sk-',
    keyPlaceholder: 'sk-…',
    requiresKey: true,
    local: false,
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    gatewayProvider: 'deepseek',
    summary: 'Cost-effective DeepSeek Chat and Reasoner endpoints.',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    category: 'frontier',
    format: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    keyPrefixHint: '',
    keyPlaceholder: 'Mistral API key…',
    requiresKey: true,
    local: false,
    models: ['mistral-large-latest', 'codestral-latest'],
    defaultModel: 'mistral-large-latest',
    docsUrl: 'https://console.mistral.ai/api-keys/',
    gatewayProvider: 'mistral',
    summary: 'European frontier models and Codestral for code review.',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (Local)',
    category: 'local',
    format: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    nativeTagsUrl: 'http://localhost:11434/api/tags',
    keyPrefixHint: '',
    keyPlaceholder: 'Optional (leave blank for local Ollama)',
    requiresKey: false,
    local: true,
    models: ['llama3.3', 'qwen2.5-coder:14b', 'deepseek-r1:14b', 'gemma3:12b', 'mistral'],
    defaultModel: 'qwen2.5-coder:14b',
    docsUrl: 'https://ollama.com',
    gatewayProvider: null,
    summary: 'Run models 100% locally on your GPU/CPU with zero data leaving your device.',
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio (Local)',
    category: 'local',
    format: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    keyPrefixHint: '',
    keyPlaceholder: 'Optional (leave blank or lm-studio)',
    requiresKey: false,
    local: true,
    models: ['local-model'],
    defaultModel: 'local-model',
    docsUrl: 'https://lmstudio.ai',
    gatewayProvider: null,
    summary: 'Connect your local LM Studio OpenAI server on port 1234.',
  },
  custom_local: {
    id: 'custom_local',
    label: 'Custom / vLLM / LocalAI',
    category: 'local',
    format: 'openai',
    baseUrl: 'http://localhost:8000/v1',
    keyPrefixHint: '',
    keyPlaceholder: 'Optional API / Bearer key',
    requiresKey: false,
    local: true,
    models: ['default'],
    defaultModel: 'default',
    docsUrl: '',
    gatewayProvider: null,
    summary: 'Any OpenAI- or Anthropic-compatible local server, Jan, vLLM, or proxy.',
  },
};

export const PROVIDER_LIST = Object.values(AI_PROVIDERS);

const getStorage = (mode) => {
  if (typeof window === 'undefined') return null;
  try {
    return mode === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

function emitChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function maskApiKey(key) {
  const clean = String(key ?? '').trim();
  if (!clean) return 'No key (local)';
  if (clean.length <= 10) return `${clean.slice(0, 3)}…`;
  return `${clean.slice(0, 7)}…${clean.slice(-4)}`;
}

export function loadImportedModels() {
  const seen = new Map();
  for (const mode of ['local', 'session']) {
    const store = getStorage(mode);
    if (!store) continue;
    try {
      const raw = store.getItem(CONNECTIONS_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (item && item.id && AI_PROVIDERS[item.provider]) {
          seen.set(item.id, { ...item, storageMode: mode });
        }
      }
    } catch {
      // Ignore malformed storage entries
    }
  }
  return [...seen.values()];
}

export function saveImportedModels(list) {
  const clean = Array.isArray(list) ? list : [];
  const localItems = clean.filter((item) => item.storageMode !== 'session');
  const sessionItems = clean.filter((item) => item.storageMode === 'session');
  const local = getStorage('local');
  const session = getStorage('session');
  if (local) {
    if (localItems.length) local.setItem(CONNECTIONS_KEY, JSON.stringify(localItems));
    else local.removeItem(CONNECTIONS_KEY);
  }
  if (session) {
    if (sessionItems.length) session.setItem(CONNECTIONS_KEY, JSON.stringify(sessionItems));
    else session.removeItem(CONNECTIONS_KEY);
  }
  emitChanged();
}

export function clearBrowserAiVault() {
  for (const mode of ['local', 'session']) {
    const store = getStorage(mode);
    store?.removeItem(CONNECTIONS_KEY);
  }
  getStorage('local')?.removeItem(ROUTING_KEY);
  emitChanged();
}

export function loadAiRouting() {
  const store = getStorage('local');
  if (!store) return { default: 'cloud' };
  try {
    const parsed = JSON.parse(store.getItem(ROUTING_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? { default: 'cloud', ...parsed } : { default: 'cloud' };
  } catch {
    return { default: 'cloud' };
  }
}

export function saveAiRouting(routing) {
  const store = getStorage('local');
  if (!store) return;
  store.setItem(ROUTING_KEY, JSON.stringify(routing ?? { default: 'cloud' }));
  emitChanged();
}

export function resolveFeatureConnection(feature = 'default', models = loadImportedModels(), routing = loadAiRouting()) {
  const explicitId = routing?.[feature];
  const targetId = explicitId && explicitId !== 'inherit' ? explicitId : routing?.default;
  if (!targetId || targetId === 'cloud') {
    if (!explicitId && !routing?.default && models.length > 0) return models[0];
    return null;
  }
  return models.find((m) => m.id === targetId) ?? null;
}

export function validateProviderKey(providerId, key, baseUrl = '') {
  const provider = AI_PROVIDERS[providerId];
  if (!provider) return { ok: false, error: 'Choose a supported provider.', warning: '' };

  const cleanKey = String(key ?? '').trim();
  const cleanUrl = String(baseUrl || provider.baseUrl || '').trim();

  if (cleanUrl && !/^https?:\/\/\S+/i.test(cleanUrl)) {
    return { ok: false, error: 'Endpoint URL must start with http:// or https://.', warning: '' };
  }

  if (provider.requiresKey) {
    if (!cleanKey) return { ok: false, error: `Paste your ${provider.label} API key.`, warning: '' };
    if (/\s/.test(cleanKey)) return { ok: false, error: 'API keys cannot contain spaces or line breaks.', warning: '' };
    if (cleanKey.length < 16) return { ok: false, error: 'That key looks too short to be valid.', warning: '' };
  } else if (cleanKey && /\s/.test(cleanKey)) {
    return { ok: false, error: 'Optional Bearer key cannot contain spaces.', warning: '' };
  }

  let warning = '';
  if (provider.keyPrefixHint && cleanKey && !cleanKey.startsWith(provider.keyPrefixHint)) {
    warning = `${provider.label} keys usually start with "${provider.keyPrefixHint}". Double-check before saving.`;
  }

  return { ok: true, error: '', warning };
}

export function upsertImportedModel(draft) {
  const list = loadImportedModels();
  const provider = AI_PROVIDERS[draft.provider];
  if (!provider) throw new Error('Unknown AI provider.');

  const id = draft.id || `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const entry = {
    id,
    provider: draft.provider,
    label: String(draft.label ?? '').trim() || provider.label,
    apiKey: String(draft.apiKey ?? '').trim(),
    keyMask: maskApiKey(draft.apiKey),
    baseUrl: String(draft.baseUrl || provider.baseUrl).trim().replace(/\/+$/, ''),
    format: draft.format || provider.format,
    defaultModel: String(draft.defaultModel || provider.defaultModel).trim(),
    storageMode: draft.storageMode === 'session' ? 'session' : 'local',
    verifiedAt: draft.verifiedAt ?? null,
    latencyMs: draft.latencyMs ?? null,
    lastError: draft.lastError ?? null,
    cloudKeyId: draft.cloudKeyId ?? null,
    createdAt: draft.createdAt ?? new Date().toISOString(),
  };

  const next = list.some((m) => m.id === id)
    ? list.map((m) => (m.id === id ? entry : m))
    : [entry, ...list];
  saveImportedModels(next);

  const routing = loadAiRouting();
  if (!routing.default || routing.default === 'cloud') {
    saveAiRouting({ ...routing, default: entry.id });
  }
  return entry;
}

export function removeImportedModel(id) {
  const list = loadImportedModels().filter((m) => m.id !== id);
  saveImportedModels(list);
  const routing = loadAiRouting();
  const nextRouting = { ...routing };
  let changed = false;
  for (const [k, v] of Object.entries(nextRouting)) {
    if (v === id) {
      nextRouting[k] = k === 'default' ? (list[0]?.id ?? 'cloud') : 'inherit';
      changed = true;
    }
  }
  if (changed) saveAiRouting(nextRouting);
}

export function buildProviderRequest(connection, { model, system, messages, maxTokens = 1400, jsonMode = false }) {
  const provider = AI_PROVIDERS[connection.provider] ?? AI_PROVIDERS.custom_local;
  const format = connection.format || provider.format || 'openai';
  const baseUrl = String(connection.baseUrl || provider.baseUrl).replace(/\/+$/, '');
  const chosenModel = String(model || connection.defaultModel || provider.defaultModel).trim();
  const sysText = Array.isArray(system) ? system.filter(Boolean).join('\n\n') : String(system ?? '');

  if (format === 'anthropic') {
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (connection.apiKey) headers['x-api-key'] = connection.apiKey;
    const body = {
      model: chosenModel,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
    };
    if (sysText) body.system = sysText;
    return { url: `${baseUrl}/messages`, format, model: chosenModel, init: { method: 'POST', headers, body: JSON.stringify(body) } };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
  if (connection.provider === 'openrouter' && typeof window !== 'undefined') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'VibeAssist';
  }

  const allMessages = [];
  if (sysText) allMessages.push({ role: 'system', content: sysText });
  for (const m of messages) {
    allMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) });
  }
  const body = { model: chosenModel, messages: allMessages, max_tokens: maxTokens };
  if (jsonMode && connection.provider !== 'custom_local') {
    body.response_format = { type: 'json_object' };
  }

  return { url: `${baseUrl}/chat/completions`, format, model: chosenModel, init: { method: 'POST', headers, body: JSON.stringify(body) } };
}

export function extractJsonFromAiText(rawText) {
  let text = String(rawText ?? '').trim();
  // Strip <think>...</think> reasoning blocks emitted by local reasoning models
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('The AI response was not valid JSON.');
  }
}

function friendlyAiFetchError(connection, err) {
  if (err?.name === 'AbortError') return 'Cancelled.';
  const provider = AI_PROVIDERS[connection.provider];
  if (provider?.local) {
    return `Could not reach ${provider.label} at ${connection.baseUrl}. Make sure the local server is running and allows browser CORS (for Ollama: OLLAMA_ORIGINS="*" ollama serve).`;
  }
  return err?.message || `Could not connect to ${provider?.label ?? 'AI provider'}. Check your network and API key.`;
}

export async function discoverProviderModels(connection) {
  const provider = AI_PROVIDERS[connection.provider] ?? AI_PROVIDERS.custom_local;
  const baseUrl = String(connection.baseUrl || provider.baseUrl).replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    if (connection.provider === 'ollama' && provider.nativeTagsUrl) {
      const origin = baseUrl.replace(/\/v1$/, '');
      const res = await fetch(`${origin}/api/tags`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        const names = (data.models ?? []).map((m) => m.name).filter(Boolean);
        if (names.length) return { ok: true, models: names };
      }
    }
    const headers = {};
    if (connection.format === 'anthropic') {
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      if (connection.apiKey) headers['x-api-key'] = connection.apiKey;
    } else if (connection.apiKey) {
      headers.Authorization = `Bearer ${connection.apiKey}`;
    }
    const res = await fetch(`${baseUrl}/models`, { headers, signal: controller.signal });
    if (!res.ok) {
      return { ok: false, models: provider.models, error: `HTTP ${res.status} while listing models.` };
    }
    const data = await res.json();
    const list = (data.data ?? data.models ?? [])
      .map((m) => (typeof m === 'string' ? m : m.id || m.name))
      .filter(Boolean)
      .map((id) => id.replace(/^models\//, ''))
      .slice(0, 40);
    return { ok: true, models: list.length ? list : provider.models };
  } catch (err) {
    return { ok: false, models: provider.models, error: friendlyAiFetchError(connection, err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function completeWithUserAi({
  feature = 'default',
  connection,
  model,
  system,
  messages,
  jsonMode = false,
  maxTokens = 1600,
  signal,
}) {
  const conn = connection ?? resolveFeatureConnection(feature);
  if (!conn) throw new Error('No imported AI model is configured for this feature.');

  const req = buildProviderRequest(conn, { model, system, messages, maxTokens, jsonMode });
  const started = performance.now();
  let res;
  try {
    res = await fetch(req.url, { ...req.init, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error(friendlyAiFetchError(conn, err));
  }

  const data = await res.json().catch(() => null);
  const latencyMs = Math.round(performance.now() - started);

  if (!res.ok) {
    const detail = data?.error?.message || data?.message || (Array.isArray(data) ? data[0]?.error?.message : '') || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${AI_PROVIDERS[conn.provider]?.label ?? conn.label} rejected the API key (${detail}).`);
    }
    throw new Error(`${AI_PROVIDERS[conn.provider]?.label ?? conn.label}: ${detail}`);
  }

  const rawText = req.format === 'anthropic'
    ? (data?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
    : typeof data?.choices?.[0]?.message?.content === 'string'
      ? data.choices[0].message.content.trim()
      : Array.isArray(data?.choices?.[0]?.message?.content)
        ? data.choices[0].message.content.map((p) => p?.text ?? '').join('').trim()
        : '';

  if (!rawText) throw new Error('The AI returned an empty response.');

  const usage = req.format === 'anthropic'
    ? { input: data?.usage?.input_tokens ?? 0, output: data?.usage?.output_tokens ?? 0 }
    : { input: data?.usage?.prompt_tokens ?? 0, output: data?.usage?.completion_tokens ?? 0 };

  if (jsonMode) {
    return { data: extractJsonFromAiText(rawText), text: rawText, model: data?.model || req.model, latencyMs, usage, connection: conn };
  }
  return { text: rawText, model: data?.model || req.model, latencyMs, usage, connection: conn };
}

export async function testAiConnection(connection, modelOverride) {
  try {
    const result = await completeWithUserAi({
      connection,
      model: modelOverride,
      system: 'You verify that an AI API connection is healthy. Reply concisely.',
      messages: [{ role: 'user', content: 'Reply with the single word READY.' }],
      maxTokens: 32,
    });
    return { ok: true, reply: result.text, model: result.model, latencyMs: result.latencyMs };
  } catch (err) {
    return { ok: false, error: err?.message || 'Connection failed.' };
  }
}

export function useImportedAi(feature = 'default') {
  const [state, setState] = useState(() => {
    const models = loadImportedModels();
    const routing = loadAiRouting();
    return { models, routing, active: resolveFeatureConnection(feature, models, routing) };
  });

  useEffect(() => {
    const sync = () => {
      const models = loadImportedModels();
      const routing = loadAiRouting();
      setState({ models, routing, active: resolveFeatureConnection(feature, models, routing) });
    };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [feature]);

  const setFeatureTarget = (targetId) => {
    const next = { ...state.routing, [feature]: targetId };
    saveAiRouting(next);
  };

  return { ...state, setFeatureTarget };
}
