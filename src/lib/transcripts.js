// Reads chat exports from AI tools into one shape the Context Handoffs page works with:
//   { format, source, conversations: [{ id, title, createdAt, messages: [{ role, text }] }] }
// role is 'user', 'assistant', 'tool' or 'note'. Everything here runs in the browser; a chat
// only leaves it, redacted and trimmed, if the user asks VibeAssist to condense it.
//
// Dedicated readers cover the exports whose layout is known (ChatGPT, Claude, Claude Code,
// Copilot in VS Code, Gemini in Google Takeout). Everything else (Grok, Meta AI, DeepSeek
// versions we haven't seen, other tools) goes through a generic reader that looks for lists of
// messages with a role and some text, then HTML, then speaker labels in plain text.
import { decodeText, unzipEntries } from '../../supabase/functions/_shared/reports.ts';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_ZIP_BYTES = 300 * 1024 * 1024;
export const ACCEPT = '.json,.jsonl,.md,.markdown,.txt,.html,.htm,.zip';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Text from the many shapes "content" takes: strings, parts arrays, { text }, { value }, …
export function textOf(content, depth = 0) {
  if (depth > 6 || content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => textOf(c, depth + 1)).filter(Boolean).join('\n');
  if (isObject(content)) {
    for (const key of ['text', 'value', 'parts', 'content', 'message']) {
      if (key in content) {
        const text = textOf(content[key], depth + 1);
        if (text) return text;
      }
    }
  }
  return '';
}

const ROLE_WORDS = {
  user: 'user', human: 'user', me: 'user', you: 'user', request: 'user', prompt: 'user', question: 'user', customer: 'user',
  assistant: 'assistant', model: 'assistant', bot: 'assistant', ai: 'assistant', chatbot: 'assistant', response: 'assistant',
  answer: 'assistant', chatgpt: 'assistant', gpt: 'assistant', claude: 'assistant', gemini: 'assistant', bard: 'assistant',
  grok: 'assistant', copilot: 'assistant', deepseek: 'assistant', 'meta ai': 'assistant', cursor: 'assistant',
  tool: 'tool', function: 'tool', tool_result: 'tool', ipython: 'tool', search: 'tool',
};

// "human", { role: 'assistant' }, "ASSISTANT" -> 'user' | 'assistant' | 'tool'; system and unknown -> null
export function roleOf(value) {
  const raw = isObject(value) ? value.role ?? value.name ?? value.type : value;
  if (typeof raw !== 'string') return null;
  return ROLE_WORDS[raw.toLowerCase().trim()] ?? null;
}

// Seconds, milliseconds, ISO strings and MongoDB-style { $date: { $numberLong } } -> ISO or null
export function toIso(value) {
  let v = value;
  if (isObject(v) && '$date' in v) v = v.$date;
  if (isObject(v) && '$numberLong' in v) v = Number(v.$numberLong);
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) v = Number(v);
  if (typeof v === 'number') v = v < 1e12 ? v * 1000 : v;
  if (v === null || v === undefined || v === '') return null;
  const date = new Date(v);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Strips what Claude Code injects into user turns (reminders can hold account details)
const stripInjected = (text) => text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();

function conversation(id, title, createdAt, messages) {
  const clean = messages.filter((m) => m && m.role && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role, text: m.text.trim() }));
  const firstPrompt = clean.find((m) => m.role === 'user')?.text.split('\n')[0] ?? '';
  return {
    id: String(id),
    title: String(title ?? '').trim().slice(0, 200) || firstPrompt.slice(0, 80) || 'Untitled chat',
    createdAt: toIso(createdAt),
    messages: clean,
  };
}

// ChatGPT (and DeepSeek): messages form a tree; current_node is the branch the user kept
function fromMapping(conv, index) {
  const nodes = conv.mapping ?? {};
  const depth = (id) => {
    let n = 0;
    for (let cur = id, seen = new Set(); cur && nodes[cur] && !seen.has(cur); cur = nodes[cur].parent) {
      seen.add(cur);
      n++;
    }
    return n;
  };
  let leaf = conv.current_node && nodes[conv.current_node] ? conv.current_node : null;
  if (!leaf) {
    const leaves = Object.keys(nodes).filter((id) => !nodes[id]?.children?.length);
    leaf = leaves.sort((a, b) => depth(b) - depth(a))[0] ?? null;
  }
  const chain = [];
  for (let cur = leaf, seen = new Set(); cur && nodes[cur] && !seen.has(cur); cur = nodes[cur].parent) {
    seen.add(cur);
    chain.unshift(nodes[cur]);
  }
  const messages = [];
  for (const node of chain) {
    const m = node?.message;
    if (!isObject(m) || m.metadata?.is_visually_hidden_from_conversation) continue;
    if (Array.isArray(m.fragments)) {
      for (const f of m.fragments) {
        const type = String(f?.type ?? '').toUpperCase();
        if (type === 'THINK') continue;
        const role = type === 'REQUEST' ? 'user' : type === 'RESPONSE' ? 'assistant' : /SEARCH|TOOL/.test(type) ? 'tool' : roleOf(m.author ?? m.role);
        messages.push({ role, text: textOf(f?.content) });
      }
      continue;
    }
    const contentType = m.content?.content_type;
    if (['thoughts', 'reasoning_recap', 'user_editable_context', 'model_editable_context'].includes(contentType)) continue;
    const role = ['code', 'execution_output'].includes(contentType) ? 'tool' : roleOf(m.author ?? m.role);
    messages.push({ role, text: textOf(m.content) });
  }
  return conversation(conv.id ?? conv.conversation_id ?? index, conv.title, conv.create_time ?? conv.inserted_at, messages);
}

// Claude.ai data export
function fromClaude(conv, index) {
  const messages = (conv.chat_messages ?? []).flatMap((m) => {
    const role = roleOf(m.sender);
    const blocks = Array.isArray(m.content) ? m.content : [];
    if (!blocks.length) return [{ role, text: textOf(m.text) }];
    return blocks.map((b) => {
      if (b?.type === 'text') return { role, text: b.text };
      if (b?.type === 'tool_use') return { role: 'tool', text: `Used ${b.name ?? 'a tool'}` };
      if (b?.type === 'tool_result') return { role: 'tool', text: textOf(b.content) };
      return null;
    });
  });
  return conversation(conv.uuid ?? index, conv.name, conv.created_at, messages);
}

// Claude Code session transcript (.jsonl): follow the active branch back from its last message
function fromClaudeCode(rows) {
  const byId = new Map();
  let title = '';
  let leaf = null;
  for (const r of rows) {
    if (r.uuid) byId.set(r.uuid, r);
    if (r.type === 'custom-title' && r.customTitle) title = r.customTitle;
    if (r.type === 'last-prompt' && r.leafUuid) leaf = r.leafUuid;
  }
  const isMessage = (r) => (r.type === 'user' || r.type === 'assistant') && !r.isSidechain && !r.isMeta;
  if (!leaf || !byId.has(leaf)) leaf = [...rows].reverse().find(isMessage)?.uuid;
  let chain = [];
  for (let cur = leaf, seen = new Set(); cur && byId.has(cur) && !seen.has(cur); cur = byId.get(cur).parentUuid) {
    seen.add(cur);
    chain.unshift(byId.get(cur));
  }
  chain = chain.filter(isMessage);
  if (chain.length < 2) chain = rows.filter(isMessage); // broken links: fall back to file order

  const messages = [];
  for (const r of chain) {
    const content = r.message?.content;
    if (typeof content === 'string') {
      messages.push({ role: r.type === 'user' ? 'user' : 'assistant', text: stripInjected(content) });
      continue;
    }
    for (const b of Array.isArray(content) ? content : []) {
      if (b?.type === 'text') messages.push({ role: r.type === 'user' ? 'user' : 'assistant', text: stripInjected(b.text ?? '') });
      else if (b?.type === 'tool_use') messages.push({ role: 'tool', text: `${b.name}(${JSON.stringify(b.input ?? {}).slice(0, 200)})` });
      else if (b?.type === 'tool_result') messages.push({ role: 'tool', text: stripInjected(textOf(b.content)) });
    }
  }
  const first = chain[0];
  return conversation(first?.sessionId ?? 'claude-code', title, first?.timestamp, messages);
}

// GitHub Copilot Chat in VS Code ("Chat: Export Chat…")
function fromCopilot(data) {
  const responseText = (parts) => (Array.isArray(parts) ? parts : [parts])
    .map((p) => (typeof p === 'string' ? p : typeof p?.value === 'string' ? p.value : typeof p?.content?.value === 'string' ? p.content.value : ''))
    .join('');
  const messages = data.requests.flatMap((r) => [
    { role: 'user', text: textOf(r.message?.text ?? r.message) },
    { role: 'assistant', text: responseText(r.response) },
  ]);
  return conversation('copilot', '', data.requests[0]?.timestamp, messages);
}

// Gemini in Google Takeout (My Activity): one entry per prompt, grouped into chats by time gaps
function fromGeminiActivity(items) {
  const entries = items
    .filter((i) => isObject(i) && typeof i.title === 'string')
    .map((i) => ({ at: toIso(i.time), prompt: i.title.replace(/^Prompted\s+/i, ''), answer: (i.safeHtmlItem ?? []).map((h) => htmlToText(h?.html ?? '')).join('\n') }))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const chats = [];
  let current = null;
  let last = 0;
  for (const e of entries) {
    const at = e.at ? new Date(e.at).getTime() : last;
    if (!current || at - last > 30 * 60_000) chats.push((current = { at: e.at, messages: [] }));
    current.messages.push({ role: 'user', text: e.prompt }, { role: 'assistant', text: e.answer });
    last = at;
  }
  return chats.map((c, i) => conversation(`gemini-${i}`, '', c.at, c.messages));
}

const TITLE_KEYS = ['title', 'name', 'subject', 'topic'];
const DATE_KEYS = ['create_time', 'created_at', 'createdAt', 'inserted_at', 'start_time', 'timestamp', 'time', 'date'];
const pick = (obj, keys) => {
  for (const source of [obj, obj?.conversation, obj?.metadata]) {
    if (!isObject(source)) continue;
    for (const key of keys) if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return undefined;
};

// One message (or a prompt + answer pair) from an object of unknown shape
function genericMessage(item) {
  let obj = item;
  const keys = Object.keys(obj);
  const hasField = (o) => ['role', 'author', 'sender', 'speaker', 'from'].some((k) => k in o);
  if (!hasField(obj) && keys.length === 1 && isObject(obj[keys[0]])) obj = obj[keys[0]]; // { response: { … } }
  const role = roleOf(obj.role ?? obj.author ?? obj.sender ?? obj.speaker ?? obj.from ?? obj.type);
  const text = textOf(obj.content ?? obj.text ?? obj.message ?? obj.parts ?? obj.body ?? obj.value);
  if (role && text) return [{ role, text }];
  const prompt = obj.prompt ?? obj.query ?? obj.question ?? obj.request ?? obj.input;
  const answer = obj.response ?? obj.answer ?? obj.reply ?? obj.output ?? obj.completion;
  if (prompt !== undefined && answer !== undefined) {
    return [{ role: 'user', text: textOf(prompt) }, { role: 'assistant', text: textOf(answer) }].filter((m) => m.text);
  }
  return null;
}

// Searches any JSON for lists that look like chats
function fromGeneric(data) {
  const found = [];
  const walk = (node, parent, depth) => {
    if (depth > 8) return;
    if (Array.isArray(node)) {
      const objects = node.filter(isObject);
      const parsed = objects.map(genericMessage);
      const good = parsed.filter(Boolean);
      if (objects.length >= 1 && good.length >= Math.max(1, Math.ceil(objects.length * 0.5)) && good.flat().length >= 2) {
        found.push({ parent, messages: good.flat() });
        return;
      }
      for (const child of node) walk(child, isObject(child) ? child : parent, depth + 1);
    } else if (isObject(node)) {
      for (const value of Object.values(node)) walk(value, node, depth + 1);
    }
  };
  walk(data, isObject(data) ? data : null, 0);
  return found.map((f, i) => conversation(pick(f.parent, ['id', 'uuid', 'conversation_id']) ?? `chat-${i}`, pick(f.parent, TITLE_KEYS), pick(f.parent, DATE_KEYS), f.messages));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|pre|blockquote|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
      if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Plain text or Markdown with speaker labels: "User:", "**Assistant**", "## Claude", "You said:", …
const LABELS = 'You said|ChatGPT said|Claude said|Gemini said|Copilot said|User|You|Me|Human|Assistant|AI|ChatGPT|Claude|Gemini|Copilot|GitHub Copilot|Grok|DeepSeek|Meta AI|Cursor|Bot|Model';
const OWN_LINE = new RegExp(`^\\s{0,3}(?:#{1,6}\\s*)?[*_]{0,3}\\s*(${LABELS})\\s*(?:\\([^)]*\\))?\\s*[*_]{0,3}\\s*:?\\s*[*_]{0,3}\\s*$`, 'i');
const INLINE = new RegExp(`^\\s*[*_]{0,3}(${LABELS})[*_]{0,3}\\s*:[*_]{0,3}\\s+(.*)$`, 'i');
const USER_LABELS = /^(you said|user|you|me|human)$/i;

function fromText(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const messages = [];
  let current = null;
  let labels = 0;
  let assistantName = '';
  for (const line of lines) {
    const own = OWN_LINE.exec(line);
    const inline = own ? null : INLINE.exec(line);
    const label = own?.[1] ?? inline?.[1];
    if (label) {
      labels++;
      const user = USER_LABELS.test(label);
      if (!user && !assistantName) assistantName = label.replace(/\s+said$/i, '');
      current = { role: user ? 'user' : 'assistant', lines: inline ? [inline[2]] : [] };
      messages.push(current);
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      // Text before the first speaker label, such as a title the exporter added
      current = { role: 'note', lines: [line] };
      messages.push(current);
    }
  }
  if (labels < 2) return { assistantName: '', messages: [{ role: 'note', text: String(text).trim() }] };
  return { assistantName, messages: messages.map((m) => ({ role: m.role, text: m.lines.join('\n').replace(/^\s*-{3,}\s*$/gm, '').trim() })) };
}

const SOURCE_HINTS = [
  [/claude[\s_-]?code|\.jsonl$/i, 'claude_code'], [/chatgpt|openai/i, 'chatgpt'], [/claude|anthropic/i, 'claude'], [/gemini|bard/i, 'gemini'],
  [/deepseek/i, 'deepseek'], [/copilot/i, 'copilot'], [/grok|xai|x\.ai/i, 'grok'], [/meta/i, 'meta'], [/cursor|specstory/i, 'cursor'],
];
const sourceHint = (...texts) => SOURCE_HINTS.find(([re]) => texts.some((t) => t && re.test(t)))?.[1] ?? 'other';

function parseJsonLines(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      return null; // not JSON lines after all
    }
  }
  return rows;
}

// Any text the user picked or pasted -> { format, source, conversations }
export function parseTranscript(name, text) {
  const fileName = String(name ?? '');
  const body = String(text ?? '').replace(/^﻿/, '');
  const trimmed = body.trim();
  if (!trimmed) throw new Error('That file is empty.');

  // JSON lines (Claude Code sessions, some exporters)
  if (/\.jsonl$/i.test(fileName) || (/^\{/.test(trimmed) && /\}\s*\n\s*\{/.test(trimmed))) {
    const rows = parseJsonLines(trimmed);
    if (rows?.length) {
      if (rows.some((r) => (r.type === 'user' || r.type === 'assistant') && r.message)) {
        return finish('claude_code', 'claude_code', [fromClaudeCode(rows)]);
      }
      return finish('json', sourceHint(fileName), fromGeneric(rows));
    }
  }

  if (/^[[{]/.test(trimmed)) {
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      data = undefined;
    }
    if (data !== undefined) return fromJson(data, fileName);
  }

  if (/\.html?$/i.test(fileName) || /^<(!doctype|html|head|body|div)/i.test(trimmed)) {
    // ChatGPT's chat.html carries the whole export as JSON in a script
    const embedded = /var\s+jsonData\s*=\s*(\[[\s\S]*?\]);\s*(\n|<\/script>)/.exec(trimmed);
    if (embedded) {
      try {
        return fromJson(JSON.parse(embedded[1]), 'chatgpt.html');
      } catch {
        // fall through to plain text
      }
    }
    return fromPlain(htmlToText(trimmed), fileName, 'html');
  }
  return fromPlain(trimmed, fileName, 'text');
}

function fromPlain(text, fileName, format) {
  const { assistantName, messages } = fromText(text);
  return finish(format, sourceHint(assistantName, fileName), [conversation('pasted', '', null, messages)]);
}

function fromJson(data, fileName) {
  const list = Array.isArray(data) ? data : null;
  const items = list ?? [data];
  if (items.some((c) => isObject(c) && isObject(c.mapping))) {
    const convs = items.filter((c) => isObject(c) && isObject(c.mapping));
    const deepseek = /deepseek/i.test(fileName) || convs.some((c) => Object.values(c.mapping).some((n) => Array.isArray(n?.message?.fragments)));
    return finish(deepseek ? 'deepseek' : 'chatgpt', deepseek ? 'deepseek' : 'chatgpt', convs.map(fromMapping));
  }
  if (items.some((c) => isObject(c) && Array.isArray(c.chat_messages))) {
    return finish('claude', 'claude', items.filter((c) => isObject(c) && Array.isArray(c.chat_messages)).map(fromClaude));
  }
  if (isObject(data) && Array.isArray(data.requests) && data.requests.some((r) => r?.message)) {
    return finish('copilot', 'copilot', [fromCopilot(data)]);
  }
  if (list && list.some((i) => isObject(i) && /gemini|bard/i.test(String(i.header ?? '')))) {
    return finish('gemini', 'gemini', fromGeminiActivity(list.filter((i) => /gemini|bard/i.test(String(i?.header ?? '')))));
  }
  const generic = fromGeneric(data);
  const source = sourceHint(fileName, isObject(data) ? String(data.responderUsername ?? '') : '');
  return finish('json', source, generic);
}

function finish(format, source, conversations) {
  const usable = conversations.filter((c) => c.messages.length)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  if (!usable.length) {
    throw new Error("We couldn't find a conversation in this file. Paste the chat as text instead, or use \"Ask your AI to write it\".");
  }
  return { format, source, conversations: usable };
}

const megabytes = (bytes) => `${Math.round(bytes / 1048576)} MB`;
const WANTED_IN_ZIP = (name) => /\.(json|jsonl|html?|md|txt)$/i.test(name) && !/(^|\/)(__MACOSX|\.)/.test(name);

// A file the user picked: plain files are read as text, zips are opened and their chat files read
export async function readTranscriptFile(file) {
  const zip = /\.zip$/i.test(file.name) || /zip/.test(file.type ?? '');
  const limit = zip ? MAX_ZIP_BYTES : MAX_FILE_BYTES;
  if (file.size > limit) throw new Error(`That file is ${megabytes(file.size)}; the limit is ${megabytes(limit)}.`);
  if (!zip) return parseTranscript(file.name, await file.text());

  const entries = await unzipEntries(new Uint8Array(await file.arrayBuffer()), WANTED_IN_ZIP);
  // Conversation files first: chat.html in a ChatGPT export repeats conversations.json
  entries.sort((a, b) => Number(/conversation/i.test(b.name)) - Number(/conversation/i.test(a.name)));
  for (const entry of entries) {
    try {
      const result = parseTranscript(entry.name, decodeText(entry.data));
      if (result.format !== 'text' || entries.length === 1) return result;
    } catch {
      // not a chat file: try the next one
    }
  }
  throw new Error("We couldn't find a conversation in this zip. Unzip it and pick the conversations file, or paste the chat as text.");
}
