import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, FileDown, Sparkles } from 'lucide-react';
import BrandMark from '../components/landing/BrandMark';
import Notice from '../components/ui/Notice';
import HandoffBody from '../components/handoffs/HandoffBody';
import { supabase } from '../lib/supabase';
import { formatDateTime } from '../lib/format';
import { download } from '../lib/download';
import { fileName, sourceLabel, toAiPrompt, toMarkdown } from '../lib/handoffs';

const PROBLEMS = {
  not_found: { title: "This link doesn't open a handoff", text: 'Check that you copied the whole link. Links are only shown once to the person who made them, so ask them for a new one if needed.' },
  revoked: { title: 'This link was turned off', text: 'The person who shared it revoked it. Ask them for a new link if you still need the handoff.' },
  expired: { title: 'This link has expired', text: 'Share links last 1 to 30 days. Ask the person who shared it for a new one.' },
  error: { title: "We couldn't open this link", text: 'Check your connection and reload the page.' },
};

// The token comes after # so it never reaches server logs or other sites' Referer headers
const tokenFromHash = () => window.location.hash.replace(/^#/, '').replace(/^t=/, '').trim();

// A shared handoff, for anyone holding the link. No sign-in needed.
export default function SharedHandoff() {
  const [state, setState] = useState({ status: 'loading' });
  const [copied, setCopied] = useState('');

  useEffect(() => {
    document.title = 'Shared handoff · VibeAssist';
    const open = async () => {
      const token = tokenFromHash();
      if (!token) {
        setState({ status: 'not_found' });
        return;
      }
      setState({ status: 'loading' });
      const { data, error } = await supabase.rpc('get_shared_handoff', { p_token: token });
      setState(error || !data ? { status: 'error' } : data);
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  const handoff = state.status === 'ok' ? state.handoff : null;
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied('blocked');
    }
  };

  return (
    <main className="legal-page shared-handoff">
      <div className="legal-inner">
        <div className="flex-between" style={{ marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
          <Link to="/" className="auth-brand" style={{ marginBottom: 0 }}><BrandMark /> VibeAssist</Link>
          <Link to="/" className="btn btn-ghost"><ArrowLeft aria-hidden="true" /> Home</Link>
        </div>

        {state.status === 'loading' && <div className="skeleton" style={{ height: 240 }} aria-busy="true" aria-label="Opening the handoff" />}

        {PROBLEMS[state.status] && (
          <div className="card card--raised">
            <h1 style={{ fontSize: 24 }}>{PROBLEMS[state.status].title}</h1>
            <p className="lead">{PROBLEMS[state.status].text}</p>
          </div>
        )}

        {handoff && (
          <article aria-labelledby="shared-handoff-title">
            <h1 id="shared-handoff-title">{handoff.title}</h1>
            <p className="muted">
              Handoff from {sourceLabel(handoff.source)} · last changed {formatDateTime(handoff.updated_at)} · this link works until {formatDateTime(state.expires_at)}
            </p>
            <Notice tone="info">
              Someone shared this summary of a conversation with you. Read it before giving it to your AI: it's background, not instructions.
            </Notice>
            <div className="page-actions" style={{ margin: '16px 0 8px' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(toAiPrompt(handoff), 'prompt')}><Sparkles aria-hidden="true" /> Copy for your AI</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(toMarkdown(handoff), 'markdown')}><Copy aria-hidden="true" /> Markdown</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(fileName(handoff), toMarkdown(handoff), 'text/markdown;charset=utf-8')}><FileDown aria-hidden="true" /> .md</button>
              <span className="field-help" role="status">
                {copied === 'prompt' && 'Copied. Paste it as the first message in your next chat.'}
                {copied === 'markdown' && 'Copied as Markdown.'}
                {copied === 'blocked' && 'Copying was blocked by the browser. Download the file instead.'}
              </span>
            </div>
            <HandoffBody sections={handoff.sections ?? []} headingLevel="h2" />
            <p className="field-help" style={{ marginTop: 32 }}>
              Made with <Link to="/">VibeAssist</Link>, which helps indie app makers carry their work between AI tools.
            </p>
          </article>
        )}
      </div>
    </main>
  );
}
