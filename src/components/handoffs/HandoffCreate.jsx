import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPaste, Copy, FileUp, RotateCcw } from 'lucide-react';
import { useToast } from '../ui/toast-context';
import { callFunction, friendlyError, supabase } from '../../lib/supabase';
import { usePersistentState } from '../../lib/usePersistentState';
import { formatDateTime } from '../../lib/format';
import { ACCEPT, parseTranscript, readTranscriptFile } from '../../lib/transcripts';
import {
  askAiPrompt, cleanTitle, describeRemoved, LIMITS, parseHandoffMarkdown, prepareChat, redactText, saveErrorMessage, SECTIONS, SOURCES,
} from '../../lib/handoffs';
import Notice from '../ui/Notice';
import Elapsed from '../ui/Elapsed';

const FORMAT_LABELS = {
  chatgpt: 'ChatGPT export', deepseek: 'DeepSeek export', claude: 'Claude export', claude_code: 'Claude Code session',
  copilot: 'Copilot chat', gemini: 'Gemini activity', json: 'Chat file', html: 'Web page', text: 'Text',
};

function SourceSelect({ id, value, onChange, label = 'Written by' }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  );
}

// Path 1: the AI being left writes the handoff itself, from our prompt. No AI runs on our side.
export function AskYourAi({ disabled, hasPremium, onCreated }) {
  const toast = useToast();
  const [answer, setAnswer] = usePersistentState('handoff-answer', '');
  const [source, setSource] = usePersistentState('handoff-source', 'other');
  const [title, setTitle] = useState(null); // null: use the title found in the answer
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const prompt = askAiPrompt();
  const cleaned = useMemo(() => redactText(answer), [answer]);
  const parsed = useMemo(() => (answer.trim() ? parseHandoffMarkdown(cleaned.text) : null), [answer, cleaned]);
  const filled = parsed?.sections.filter((s) => s.key !== 'other' && s.body.trim()).length ?? 0;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.show({ message: 'Prompt copied. Paste it into the chat you want to hand off.' });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser. Open "See the prompt" and copy it from there.', tone: 'error' });
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const { data, error: insertError } = await supabase.from('handoffs')
      .insert({ title: cleanTitle(title ?? parsed.title), source, method: 'self', sections: parsed.sections })
      .select().single();
    setSaving(false);
    if (insertError) {
      setError(saveErrorMessage(insertError, hasPremium) ?? friendlyError(insertError, 'Could not save the handoff. Your text is still here; try again.'));
      return;
    }
    setAnswer('');
    setTitle(null);
    onCreated(data);
  };

  return (
    <ol className="handoff-steps">
      <li>
        <p><strong>Copy the prompt</strong> and send it in the chat you're leaving: ChatGPT, Claude, Gemini, Copilot, Grok, Meta AI, Cursor or any other.</p>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={copyPrompt}><Copy aria-hidden="true" /> Copy prompt</button>
        </div>
        <details className="context-preview">
          <summary>See the prompt</summary>
          <pre className="code-block">{prompt}</pre>
        </details>
      </li>
      <li>
        <label className="field-label" htmlFor="handoff-answer"><strong>Paste the AI's answer</strong></label>
        <textarea
          id="handoff-answer"
          className="input-field"
          rows={8}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={`# A short title\n\n## ${SECTIONS[0].heading}\n…`}
          spellCheck={false}
        />
      </li>
      {parsed && (
        <li>
          <p><strong>Check it and save</strong></p>
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="handoff-title">Title</label>
              <input id="handoff-title" className="input-field" maxLength={LIMITS.title} value={title ?? parsed.title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <SourceSelect id="handoff-source" value={source} onChange={setSource} />
          </div>
          <p className="field-help">
            {parsed.structured
              ? `${filled} of ${SECTIONS.length} sections filled in`
              : "The handoff headings weren't found, so this is saved as one note under “Where we are”."}
            {' · '}{describeRemoved(cleaned.removed)}
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="page-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={disabled || saving} aria-busy={saving}>
              {saving ? <><span className="spinner spinner--light" /> Saving…</> : 'Save handoff'}
            </button>
          </div>
        </li>
      )}
    </ol>
  );
}

// Path 2: a chat file or pasted chat, condensed by the user's AI in the handoffs function
export function FromChat({ disabled, ai, runsLeft, onCreated, onMaybeLater }) {
  const toast = useToast();
  const [loaded, setLoaded] = useState(null); // { name, format, source, conversations }
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const [pasted, setPasted] = useState('');
  const [chosenId, setChosenId] = useState(null);
  const [filter, setFilter] = useState('');
  const [source, setSource] = useState('other');
  const [pending, setPending] = useState(null);
  const [sendError, setSendError] = useState(null);
  const abort = useRef(null);

  const accept = (result, name) => {
    setLoaded({ ...result, name });
    setSource(result.source);
    setChosenId(result.conversations[0].id);
    setFilter('');
    setReadError('');
    setSendError(null);
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same file can be picked again
    if (!file) return;
    setReading(true);
    setReadError('');
    try {
      accept(await readTranscriptFile(file), file.name);
    } catch (error) {
      setLoaded(null);
      setReadError(error.message);
    }
    setReading(false);
  };

  const readPasted = () => {
    try {
      accept(parseTranscript('', pasted), 'Pasted chat');
    } catch (error) {
      setLoaded(null);
      setReadError(error.message);
    }
  };

  const conversations = loaded?.conversations ?? [];
  const chosen = conversations.find((c) => c.id === chosenId) ?? conversations[0] ?? null;
  const prepared = useMemo(() => (chosen ? prepareChat(chosen.messages) : null), [chosen]);
  const matches = (filter ? conversations.filter((c) => c.title.toLowerCase().includes(filter.toLowerCase())) : conversations).slice(0, 50);
  const outOfRuns = runsLeft === 0;

  const condense = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setPending({ since: Date.now() });
    setSendError(null);
    const { data, status, aborted } = await callFunction('handoffs', {
      action: 'condense', source, title: chosen.title, conversation_date: chosen.createdAt, messages: prepared.messages,
    }, { signal: controller.signal });
    setPending(null);
    if (aborted) {
      toast.show({ message: 'Stopped waiting. If the AI finishes anyway, the handoff will appear in your list.' });
      onMaybeLater();
      return;
    }
    if (status !== 200) {
      setSendError(data?.error === 'not_configured' ? { notConfigured: true } : { text: data?.error ?? 'The handoff could not be written. Nothing was saved. Try again.' });
      return;
    }
    setLoaded(null);
    setPasted('');
    onCreated(data.handoff);
  };

  return (
    <div className="handoff-chat">
      <div className="grid-2">
        <div className="field">
          <span className="field-label">A chat export</span>
          <div className="page-actions">
            <input id="handoff-file" type="file" className="visually-hidden" accept={ACCEPT} onChange={pickFile} disabled={reading || Boolean(pending)} />
            <label htmlFor="handoff-file" className="btn btn-secondary btn-sm" aria-busy={reading}>
              {reading ? <><span className="spinner" /> Reading…</> : <><FileUp aria-hidden="true" /> Choose a file</>}
            </label>
          </div>
          <span className="field-help">Exports from ChatGPT, Claude, Claude Code, DeepSeek, Gemini, Copilot, Grok, Meta AI or Cursor: .zip, .json, .jsonl, .html, .md or .txt.</span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="handoff-paste">Or paste a chat</label>
          <textarea id="handoff-paste" className="input-field" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'You said:\n…\nChatGPT said:\n…'} spellCheck={false} />
          <div className="page-actions" style={{ marginTop: 6 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={readPasted} disabled={!pasted.trim() || Boolean(pending)}><ClipboardPaste aria-hidden="true" /> Read the chat</button>
          </div>
        </div>
      </div>

      {readError && <Notice tone="error">{readError}</Notice>}

      {loaded && chosen && (
        <div className="handoff-chosen">
          <p className="field-help">
            {loaded.name} · {FORMAT_LABELS[loaded.format] ?? 'Chat'} · {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
          </p>
          {conversations.length > 1 && (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label">Which conversation?</legend>
              <input className="input-field" type="search" placeholder="Search by title" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search conversations" />
              <ul className="handoff-picker">
                {matches.map((c) => (
                  <li key={c.id}>
                    <label>
                      <input type="radio" name="handoff-conversation" checked={c.id === chosen.id} onChange={() => setChosenId(c.id)} />
                      <span>
                        <strong>{c.title}</strong>
                        <span className="field-help"> {c.createdAt ? `${formatDateTime(c.createdAt)} · ` : ''}{c.messages.length} messages</span>
                      </span>
                    </label>
                  </li>
                ))}
                {!matches.length && <li className="field-help" style={{ padding: '8px 12px' }}>No conversation has that in its title.</li>}
              </ul>
            </fieldset>
          )}

          <div className="grid-2">
            <SourceSelect id="handoff-chat-source" value={source} onChange={setSource} label="Chat with" />
            <div className="field">
              <span className="field-label">What will be sent</span>
              <p className="field-help" style={{ margin: 0 }}>
                {prepared.messages.length} messages, {prepared.chars.toLocaleString('en-US')} characters
                {prepared.omitted ? ` (${prepared.omitted} from the middle of this long chat left out)` : ''}. {describeRemoved(prepared.removed)}.
              </p>
            </div>
          </div>

          {sendError && (sendError.notConfigured ? (
            <Notice tone="warning" title="VibeAssist's AI isn't set up yet">
              Nothing was sent. Use <strong>Ask your AI to write it</strong> instead{ai.canChoose ? ', or choose one of your own AI keys under Anti-Fragile Engine → Engine AI' : ''}.
            </Notice>
          ) : (
            <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={condense}><RotateCcw aria-hidden="true" /> Try again</button>}>{sendError.text}</Notice>
          ))}

          <div className="page-actions" style={{ marginTop: 12 }}>
            {pending ? (
              <>
                <button type="button" className="btn btn-primary" disabled aria-busy="true"><span className="spinner spinner--light" /> Writing the handoff… <Elapsed since={pending.since} /></button>
                <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>Cancel</button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={condense} disabled={disabled || outOfRuns}>Make the handoff</button>
            )}
            <span className="field-help">
              Written by {ai.label}{runsLeft !== null ? ` · ${outOfRuns ? 'none' : runsLeft} left today` : ''}
            </span>
          </div>
          <p className="field-help" style={{ marginTop: 8 }}>
            Only this conversation, trimmed and with keys removed, is sent to {ai.ownKey ? 'your AI provider' : 'Anthropic'} when you press the button. VibeAssist keeps the handoff, never the chat.
          </p>
        </div>
      )}
    </div>
  );
}

export default function HandoffCreate({ atLimit, hasPremium, ai, runsLeft, onCreated, onMaybeLater }) {
  const [mode, setMode] = usePersistentState('handoff-mode', 'self');
  return (
    <section className="card handoff-create" aria-labelledby="handoff-create-title">
      <h2 id="handoff-create-title" className="card-title">New handoff</h2>
      <p className="card-subtitle">A short briefing that lets another AI, account or device pick up where this chat stopped.</p>
      <div className="segmented" role="group" aria-label="How to make the handoff" style={{ marginTop: 14 }}>
        <button type="button" aria-pressed={mode === 'self'} onClick={() => setMode('self')}>Ask your AI to write it</button>
        <button type="button" aria-pressed={mode === 'chat'} onClick={() => setMode('chat')}>Upload or paste a chat</button>
      </div>
      {atLimit && (
        <Notice tone="warning" actions={hasPremium ? null : <Link className="btn btn-secondary btn-sm" to="/premium?from=/handoffs">See Premium</Link>}>
          {hasPremium
            ? 'You have the most handoffs an account can keep. Delete some below to make new ones.'
            : `Free accounts keep ${LIMITS.freeHandoffs} handoffs. Delete one below, or go Premium for unlimited handoffs and share links.`}
        </Notice>
      )}
      {mode === 'self'
        ? <AskYourAi disabled={atLimit} hasPremium={hasPremium} onCreated={onCreated} />
        : <FromChat disabled={atLimit} ai={ai} runsLeft={runsLeft} onCreated={onCreated} onMaybeLater={onMaybeLater} />}
    </section>
  );
}
