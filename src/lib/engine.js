import { callFunction } from './supabase';

// The seven modules of the Anti-Fragile Vibe Orchestrator, as the original page named them.
// "where" says where each one runs: inside VibeAssist, in the GitHub Action, or as the gateway.
export const MODULES = [
  { key: 'red_team', title: 'Red Team Agents', desc: 'Adversarial Review Sub-Agents (Security & Architecture)', where: 'app', ai: true },
  { key: 'preflight', title: 'Pre-Flight Scanner', desc: 'Automated Vibe Diagnosis & Security Guardrails', where: 'app', ai: false },
  { key: 'drift', title: 'Context & Drift', desc: 'Modular Context Management & Drift Watch', where: 'app', ai: true },
  { key: 'mutation', title: 'Mutation Validator', desc: 'Anti-Tautological Testing (Detecting fake passing tests)', where: 'action' },
  { key: 'vision', title: 'Vision Grounding', desc: 'Playwright + VLM visual layout testing loop', where: 'action' },
  { key: 'snapshot', title: 'Snapshot Engine', desc: 'State Rewind & Strict Checkpointing (Git hooks)', where: 'action' },
  { key: 'gateway', title: 'Smart Token Gateway', desc: 'LLM Routing & Rate Limit Fallbacks', where: 'gateway' },
];
export const moduleTitle = (key) => MODULES.find((m) => m.key === key)?.title ?? key;

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
export const SEVERITY_TONE = { critical: 'danger', high: 'danger', medium: 'warning', low: '', info: '' };
export const bySeverity = (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);

export const RUN_LABEL = { queued: 'Waiting', running: 'Running', succeeded: 'Done', failed: 'Failed', timed_out: 'Timed out', skipped: 'Skipped' };
export const OUTCOME_LABEL = { pass: 'Pass', warn: 'Warnings', fail: 'Needs fixing' };
export const isActive = (run) => run?.status === 'queued' || run?.status === 'running';

export const PROVIDERS = {
  anthropic: { label: 'Anthropic', format: 'anthropic', example: 'claude-opus-5-5' },
  openai: { label: 'OpenAI', format: 'openai', example: 'gpt-4.1-mini' },
  openrouter: { label: 'OpenRouter', format: 'openai', example: 'anthropic/claude-sonnet-5-5' },
  groq: { label: 'Groq', format: 'openai', example: 'llama-3.3-70b-versatile' },
  gemini: { label: 'Google Gemini', format: 'openai', example: 'gemini-2.5-flash' },
  mistral: { label: 'Mistral', format: 'openai', example: 'mistral-large-latest' },
  deepseek: { label: 'DeepSeek', format: 'openai', example: 'deepseek-chat' },
};

// Without a saved choice the engine uses the newest Anthropic gateway key, else VibeAssist's Claude
export function effectiveAiChoice(settings, providerKeys) {
  if (settings) return { keyId: settings.provider_key_id ?? '', model: settings.model ?? '' };
  const anthropic = providerKeys.filter((k) => k.provider === 'anthropic').at(-1);
  return { keyId: anthropic?.id ?? '', model: '' };
}

// What the module tiles say about the AI they use
export function aiLabel(settings, providerKeys) {
  const { keyId, model } = effectiveAiChoice(settings, providerKeys);
  const key = providerKeys.find((k) => k.id === keyId);
  if (!key) return "VibeAssist's Claude";
  return `your ${PROVIDERS[key.provider].label} key${model ? ` (${model})` : ''}`;
}

export async function engine(action, body = {}) {
  const { data, status } = await callFunction('engine', { action, ...body });
  if (status === 200) return data;
  return { error: data?.error === 'not_configured' ? 'No AI key is set up for the engine yet: choose one of your own provider keys under Engine AI, or add ANTHROPIC_API_KEY in Supabase.' : data?.error ?? 'The engine couldn\'t do that. Try again.' };
}

// "a few seconds ago" style for the log and run list
export function since(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Rewind steps that never rewrite history
export const rewindSteps = (tag) => [
  `git fetch --tags`,
  `git switch -c rewind/${tag} ${tag}`,
  `# or undo everything since the snapshot in one new commit, on your current branch:`,
  `git revert --no-commit ${tag}..HEAD && git commit -m "Rewind to ${tag}"`,
];
