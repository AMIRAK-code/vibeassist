// Context Handoffs in the browser: the format shared with the handoffs Edge Function, plus what
// only the page needs (showing sections, file names, preparing a chat to send).
import { bodyBlocks } from './legalDocs';
import { budgetMessages, LIMITS } from '../../supabase/functions/_shared/handoff/format.js';
import { redactText } from '../../supabase/functions/_shared/handoff/redact.js';

export * from '../../supabase/functions/_shared/handoff/format.js';
export { describeRemoved, redactText } from '../../supabase/functions/_shared/handoff/redact.js';

// A section body as paragraphs, "- " lists and fenced code
export function handoffBlocks(body) {
  const blocks = [];
  const lines = String(body ?? '').replace(/\r\n/g, '\n').split('\n');
  let text = [];
  const flush = () => {
    if (text.length) blocks.push(...bodyBlocks(text.join('\n')));
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/.exec(lines[i]);
    if (!fence) {
      text.push(lines[i]);
      continue;
    }
    flush();
    const code = [];
    for (i++; i < lines.length && lines[i].trim() !== fence[1]; i++) code.push(lines[i]);
    blocks.push({ type: 'code', lang: fence[2], text: code.join('\n') });
  }
  flush();
  return blocks;
}

// "stripe-webhook-refactor-handoff.md"
export function fileName(handoff) {
  const slug = String(handoff?.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${slug || 'context'}-handoff.md`;
}

// A conversation ready to send for condensing: trimmed to the budget, then cleaned of secrets.
// Returns what will be sent and what the page should tell the user about it.
export function prepareChat(messages) {
  const { messages: kept, omitted } = budgetMessages(messages, LIMITS.budgetChars);
  const removed = {};
  const cleaned = kept.map((m) => {
    const result = redactText(m.text);
    for (const [id, n] of Object.entries(result.removed)) removed[id] = (removed[id] ?? 0) + n;
    return { role: m.role, text: result.text };
  });
  return { messages: cleaned, omitted, removed, chars: cleaned.reduce((n, m) => n + m.text.length, 0) };
}

// Supabase refuses a 4th handoff on a free account through the insert policy; say why
export function saveErrorMessage(error, hasPremium) {
  if (error?.code === '42501' || /row-level security/i.test(error?.message ?? '')) {
    return hasPremium
      ? 'You have the most handoffs an account can keep. Delete some you no longer need first.'
      : `Free accounts keep ${LIMITS.freeHandoffs} handoffs. Delete one, or go Premium for unlimited handoffs and share links.`;
  }
  return null;
}
