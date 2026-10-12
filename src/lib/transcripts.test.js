import { describe, expect, it } from 'vitest';
import { htmlToText, parseTranscript, readTranscriptFile, roleOf, textOf, toIso, MAX_FILE_BYTES } from './transcripts';

// Fixtures follow each export's layout with made-up content
const node = (id, parent, children, message) => ({ id, parent, children, message });
const chatgptExport = [
  {
    id: 'c1', title: 'Older chat', create_time: 1759000000,
    current_node: 'n2', mapping: { root: node('root', null, ['n1'], null), n1: node('n1', 'root', ['n2'], { author: { role: 'user' }, content: { content_type: 'text', parts: ['Old question'] } }), n2: node('n2', 'n1', [], { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['Old answer'] } }) },
  },
  {
    id: 'c2', title: 'Stripe webhooks', create_time: 1760000000, current_node: 'b2',
    mapping: {
      root: node('root', null, ['sys'], null),
      sys: node('sys', 'root', ['ctx'], { author: { role: 'system' }, content: { content_type: 'text', parts: ['You are ChatGPT'] } }),
      ctx: node('ctx', 'sys', ['u1'], { author: { role: 'user' }, content: { content_type: 'user_editable_context', user_profile: 'private' } }),
      u1: node('u1', 'ctx', ['think', 'b1'], { author: { role: 'user' }, content: { content_type: 'text', parts: ['How do I verify webhooks?'] } }),
      think: node('think', 'u1', ['b2'], { author: { role: 'assistant' }, content: { content_type: 'thoughts', thoughts: [{ content: 'hmm' }] } }),
      b1: node('b1', 'u1', [], { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['First draft answer'] } }),
      b2: node('b2', 'think', [], { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['Use the signing secret.', { content_type: 'image_asset_pointer' }] } }),
      hidden: node('hidden', 'b2', [], { author: { role: 'assistant' }, metadata: { is_visually_hidden_from_conversation: true }, content: { parts: ['x'] } }),
    },
  },
];

describe('ChatGPT and DeepSeek exports', () => {
  it('reads every conversation, newest first, following the branch the user kept', () => {
    const { format, source, conversations } = parseTranscript('conversations.json', JSON.stringify(chatgptExport));
    expect([format, source]).toEqual(['chatgpt', 'chatgpt']);
    expect(conversations.map((c) => c.title)).toEqual(['Stripe webhooks', 'Older chat']);
    expect(conversations[0].createdAt).toBe('2025-10-09T08:53:20.000Z');
    expect(conversations[0].messages).toEqual([
      { role: 'user', text: 'How do I verify webhooks?' },
      { role: 'assistant', text: 'Use the signing secret.' },
    ]);
  });

  it('reads DeepSeek fragments and leaves out its thinking', () => {
    const deepseek = [{ id: 'd1', title: 'Pricing', inserted_at: '2026-10-01T10:00:00Z', mapping: {
      root: node('root', null, ['m1'], null),
      m1: node('m1', 'root', [], { fragments: [{ type: 'REQUEST', content: 'What should I charge?' }, { type: 'THINK', content: 'reasoning' }, { type: 'RESPONSE', content: 'Start at $9.' }] }),
    } }];
    const { source, conversations } = parseTranscript('export.json', JSON.stringify(deepseek));
    expect(source).toBe('deepseek');
    expect(conversations[0].messages).toEqual([{ role: 'user', text: 'What should I charge?' }, { role: 'assistant', text: 'Start at $9.' }]);
  });

  it('reads the JSON inside ChatGPT chat.html', () => {
    const html = `<html><body><script>\nvar jsonData = ${JSON.stringify(chatgptExport)};\n</script></body></html>`;
    expect(parseTranscript('chat.html', html).conversations[0].title).toBe('Stripe webhooks');
  });
});

describe('Claude exports', () => {
  it('reads a Claude.ai export with text and tool blocks', () => {
    const claude = [{ uuid: 'u-1', name: 'Landing page', created_at: '2026-10-02T09:00:00Z', chat_messages: [
      { sender: 'human', text: 'Write a hero line', content: [{ type: 'text', text: 'Write a hero line' }] },
      { sender: 'assistant', text: '', content: [{ type: 'thinking', thinking: 'x' }, { type: 'tool_use', name: 'web_search' }, { type: 'text', text: 'Less friction. More flow.' }] },
    ] }];
    const { source, conversations } = parseTranscript('conversations.json', JSON.stringify(claude));
    expect(source).toBe('claude');
    expect(conversations[0]).toMatchObject({ id: 'u-1', title: 'Landing page' });
    expect(conversations[0].messages).toEqual([
      { role: 'user', text: 'Write a hero line' },
      { role: 'tool', text: 'Used web_search' },
      { role: 'assistant', text: 'Less friction. More flow.' },
    ]);
  });

  it('follows the active branch of a Claude Code session and drops injected and private lines', () => {
    const lines = [
      { type: 'attachment', uuid: 'a0', parentUuid: null, attachment: { context: 'someone@example.com' } },
      { type: 'user', uuid: 'u1', parentUuid: 'a0', sessionId: 's1', timestamp: '2026-10-12T08:00:00Z', message: { role: 'user', content: 'Fix the login bug<system-reminder>account: someone@example.com</system-reminder>' } },
      { type: 'user', uuid: 'meta', parentUuid: 'u1', isMeta: true, message: { role: 'user', content: 'Caveat: meta' } },
      { type: 'assistant', uuid: 'x1', parentUuid: 'u1', message: { role: 'assistant', content: [{ type: 'text', text: 'Abandoned branch' }] } },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'secret thoughts' }, { type: 'tool_use', name: 'Read', input: { file_path: 'src/login.js' } }] } },
      { type: 'user', uuid: 'r1', parentUuid: 'a1', message: { role: 'user', content: [{ type: 'tool_result', content: 'export function login() {}' }] } },
      { type: 'assistant', uuid: 'side', parentUuid: 'r1', isSidechain: true, message: { content: [{ type: 'text', text: 'subagent' }] } },
      { type: 'assistant', uuid: 'a2', parentUuid: 'r1', message: { role: 'assistant', content: [{ type: 'text', text: 'Fixed the redirect.' }] } },
      { type: 'custom-title', customTitle: 'Login bug', sessionId: 's1' },
      { type: 'last-prompt', lastPrompt: 'Fix the login bug', leafUuid: 'a2', sessionId: 's1' },
    ];
    const { format, conversations } = parseTranscript('s1.jsonl', lines.map((l) => JSON.stringify(l)).join('\n'));
    expect(format).toBe('claude_code');
    expect(conversations[0]).toMatchObject({ id: 's1', title: 'Login bug', createdAt: '2026-10-12T08:00:00.000Z' });
    expect(conversations[0].messages).toEqual([
      { role: 'user', text: 'Fix the login bug' },
      { role: 'tool', text: 'Read({"file_path":"src/login.js"})' },
      { role: 'tool', text: 'export function login() {}' },
      { role: 'assistant', text: 'Fixed the redirect.' },
    ]);
    expect(JSON.stringify(conversations)).not.toContain('example.com');
  });
});

describe('Copilot, Gemini and Grok', () => {
  it('reads a VS Code Copilot chat export', () => {
    const copilot = { responderUsername: 'GitHub Copilot', requests: [{ timestamp: 1760000000000, message: { text: 'Explain this regex' }, response: [{ value: 'It matches ' }, { kind: 'codeblockUri' }, { value: 'emails.' }] }] };
    const { source, conversations } = parseTranscript('chat.json', JSON.stringify(copilot));
    expect(source).toBe('copilot');
    expect(conversations[0].title).toBe('Explain this regex');
    expect(conversations[0].messages[1]).toEqual({ role: 'assistant', text: 'It matches emails.' });
  });

  it('groups Gemini activity from Google Takeout into chats by time', () => {
    const activity = [
      { header: 'Gemini Apps', title: 'Prompted Name my app', time: '2026-10-01T10:00:00Z', safeHtmlItem: [{ html: '<p>Try <b>Vibe&amp;Co</b></p>' }] },
      { header: 'Gemini Apps', title: 'Prompted Shorter please', time: '2026-10-01T10:05:00Z', safeHtmlItem: [{ html: '<p>Vibe</p>' }] },
      { header: 'Gemini Apps', title: 'Prompted Write a tagline', time: '2026-10-02T09:00:00Z', safeHtmlItem: [{ html: 'Less friction.' }] },
      { header: 'Search', title: 'Searched for cats', time: '2026-10-01T10:01:00Z' },
    ];
    const { source, conversations } = parseTranscript('MyActivity.json', JSON.stringify(activity));
    expect(source).toBe('gemini');
    expect(conversations.map((c) => c.messages.length)).toEqual([2, 4]);
    expect(conversations[1].messages[1]).toEqual({ role: 'assistant', text: 'Try Vibe&Co' });
  });

  it('reads Gemini CLI and Grok-style exports through the generic reader', () => {
    const cli = [{ role: 'user', parts: [{ text: 'List files' }] }, { role: 'model', parts: [{ text: 'src/, docs/' }] }];
    expect(parseTranscript('gemini-checkpoint.json', JSON.stringify(cli))).toMatchObject({ source: 'gemini', conversations: [{ messages: [{ role: 'user', text: 'List files' }, { role: 'assistant', text: 'src/, docs/' }] }] });

    const grok = { conversations: [{
      conversation: { id: 'g1', title: 'Launch tweet', create_time: { $date: { $numberLong: '1760000000000' } } },
      responses: [{ response: { sender: 'human', message: 'Draft a tweet' } }, { response: { sender: 'ASSISTANT', message: 'Shipping today!' } }],
    }] };
    const result = parseTranscript('prod-grok-backend.json', JSON.stringify(grok));
    expect(result.source).toBe('grok');
    expect(result.conversations[0]).toMatchObject({ id: 'g1', title: 'Launch tweet', createdAt: '2025-10-09T08:53:20.000Z' });
    expect(result.conversations[0].messages).toHaveLength(2);
  });
});

describe('text, Markdown and HTML', () => {
  it('splits a pasted chat on speaker labels', () => {
    const text = 'Exported chat\nYou said:\nHelp me price my app\n\nChatGPT said:\nTry $4.99.\nOr $9.99.';
    const { source, conversations } = parseTranscript('', text);
    expect(source).toBe('chatgpt');
    expect(conversations[0].messages).toEqual([
      { role: 'note', text: 'Exported chat' },
      { role: 'user', text: 'Help me price my app' },
      { role: 'assistant', text: 'Try $4.99.\nOr $9.99.' },
    ]);
  });

  it('reads Cursor/SpecStory Markdown and inline labels', () => {
    const md = '# Chat\n\n_**User**_\n\nAdd dark mode\n\n---\n\n_**Assistant**_\n\nDone, see `theme.css`.';
    expect(parseTranscript('cursor-chat.md', md).conversations[0].messages.slice(1)).toEqual([
      { role: 'user', text: 'Add dark mode' },
      { role: 'assistant', text: 'Done, see `theme.css`.' },
    ]);
    expect(parseTranscript('', 'User: hi\nAssistant: hello\nUser: bye').conversations[0].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('keeps text without labels as one note, and reads plain HTML', () => {
    expect(parseTranscript('notes.txt', 'Just my notes about the project.').conversations[0].messages).toEqual([{ role: 'note', text: 'Just my notes about the project.' }]);
    expect(htmlToText('<h1>Title</h1><p>One&nbsp;two &#38; three</p><script>alert(1)</script>')).toBe('Title\nOne two & three');
    const page = parseTranscript('chat.html', '<html><body><p>User:</p><p>hi</p><p>Assistant:</p><p>hello</p></body></html>');
    expect(page.format).toBe('html');
    expect(page.conversations[0].messages.map((m) => m.text)).toEqual(['hi', 'hello']);
  });

  it('explains files it cannot use', () => {
    expect(() => parseTranscript('a.json', '   ')).toThrow('That file is empty.');
    expect(() => parseTranscript('a.json', JSON.stringify({ settings: { theme: 'dark' } }))).toThrow("couldn't find a conversation");
  });
});

describe('helpers', () => {
  it('normalises roles, text and dates', () => {
    expect([roleOf('human'), roleOf({ role: 'ASSISTANT' }), roleOf('system'), roleOf(3)]).toEqual(['user', 'assistant', null, null]);
    expect(textOf({ parts: ['a', { text: 'b' }, { content_type: 'image' }] })).toBe('a\nb');
    expect([toIso(1760000000), toIso('1760000000000'), toIso('2026-10-01'), toIso('nope'), toIso(null)])
      .toEqual(['2025-10-09T08:53:20.000Z', '2025-10-09T08:53:20.000Z', '2026-10-01T00:00:00.000Z', null, null]);
  });
});

// A zip with stored (uncompressed) entries
function storedZip(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, central.reduce((n, c) => n + c.length, 0), true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('reading files', () => {
  const fakeFile = (name, bytesOrText, type = '') => {
    const bytes = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
    return { name, type, size: bytes.length, text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
  };

  it('opens a ChatGPT export zip and skips images and readme files', async () => {
    const zip = storedZip([
      { name: 'user.json', text: '{"id":"me"}' },
      { name: 'file-abc.png', text: 'not really an image' },
      { name: 'chat.html', text: '<p>ignored</p>' },
      { name: 'conversations.json', text: JSON.stringify(chatgptExport) },
    ]);
    const result = await readTranscriptFile(fakeFile('export.zip', zip, 'application/zip'));
    expect(result.format).toBe('chatgpt');
    expect(result.conversations).toHaveLength(2);
  });

  it('refuses files over the size limit before reading them', async () => {
    await expect(readTranscriptFile({ name: 'big.json', size: MAX_FILE_BYTES + 1, text: async () => '' })).rejects.toThrow('the limit is 100 MB');
    expect((await readTranscriptFile(fakeFile('chat.txt', 'User: a\nAssistant: b'))).format).toBe('text');
  });
});
