import React, { useRef, useState } from 'react';
import { Copy, FileDown, PencilLine, Sparkles, Trash2 } from 'lucide-react';
import { useToast } from '../ui/toast-context';
import { friendlyError, supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/format';
import { download } from '../../lib/download';
import { cleanTitle, fileName, LIMITS, redactText, sourceLabel, toAiPrompt, toMarkdown } from '../../lib/handoffs';
import Notice from '../ui/Notice';
import HandoffBody from './HandoffBody';
import ShareLinks from './ShareLinks';

const madeBy = (h) => (h.method === 'ai' ? `condensed by ${h.model ?? 'AI'}` : 'written by your AI');

// One handoff: read, copy, download, share, or edit. Edits only save over the version that was
// opened, and are cleaned of keys like everything else that's saved.
export default function HandoffView({ handoff, hasPremium, onSaved, onDelete }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null); // { title, sections } while editing
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(null);
  const version = useRef(handoff.updated_at);

  const startEdit = () => {
    version.current = handoff.updated_at;
    setDraft({ title: handoff.title, sections: handoff.sections.map((s) => ({ ...s })) });
    setSaveError('');
    setConflict(null);
  };

  const save = async (overwrite = false) => {
    setSaving(true);
    setSaveError('');
    const changes = {
      title: cleanTitle(redactText(draft.title).text),
      sections: draft.sections.map((s) => ({ ...s, body: redactText(s.body).text.slice(0, LIMITS.body) })),
    };
    let query = supabase.from('handoffs').update(changes).eq('id', handoff.id);
    if (!overwrite) query = query.eq('updated_at', version.current);
    const { data, error } = await query.select();
    if (!error && !data.length) {
      const { data: latest } = await supabase.from('handoffs').select('*').eq('id', handoff.id).maybeSingle();
      setSaving(false);
      setConflict(latest ?? { deleted: true });
      return;
    }
    setSaving(false);
    if (error) {
      setSaveError(friendlyError(error, 'Could not save. Your edits are still here; try again.'));
      return;
    }
    setDraft(null);
    setConflict(null);
    toast.show({ message: 'Changes saved.' });
    onSaved(data[0]);
  };

  const copy = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser. Download the file instead.', tone: 'error' });
    }
  };

  return (
    <article className="card legal-doc" aria-labelledby="handoff-title">
      <div className="section-header">
        <div>
          <h3 id="handoff-title">{handoff.title}</h3>
          <p className="field-help">
            From {sourceLabel(handoff.source)} · {madeBy(handoff)}
            {handoff.message_count ? ` · ${handoff.message_count} messages` : ''} · changed {formatDateTime(handoff.updated_at)}
          </p>
        </div>
        {!draft && (
          <div className="page-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(toAiPrompt(handoff), 'Copied. Paste it as the first message to your next AI.')}>
              <Sparkles aria-hidden="true" /> Copy for another AI
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(toMarkdown(handoff), 'Copied as Markdown.')}><Copy aria-hidden="true" /> Markdown</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(fileName(handoff), toMarkdown(handoff), 'text/markdown;charset=utf-8')}><FileDown aria-hidden="true" /> .md</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}><PencilLine aria-hidden="true" /> Edit</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(handoff)}><Trash2 aria-hidden="true" /> Delete</button>
          </div>
        )}
      </div>

      {draft ? (
        <div className="legal-edit">
          <div className="field">
            <label className="field-label" htmlFor="handoff-edit-title">Title</label>
            <input id="handoff-edit-title" className="input-field" maxLength={LIMITS.title} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          {draft.sections.map((s, i) => (
            <div className="field" key={`${s.key}-${i}`}>
              <label className="field-label" htmlFor={`handoff-section-${i}`}>{s.heading}</label>
              <textarea
                id={`handoff-section-${i}`}
                className="input-field"
                rows={Math.min(14, Math.max(3, s.body.split('\n').length + 1))}
                value={s.body}
                spellCheck={false}
                onChange={(e) => setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })}
              />
            </div>
          ))}
          {saveError && <Notice tone="error">{saveError}</Notice>}
          {conflict && (
            <Notice
              tone="warning"
              title={conflict.deleted ? 'Deleted somewhere else' : 'Changed somewhere else'}
              actions={conflict.deleted ? null : (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onSaved(conflict); setDraft({ title: conflict.title, sections: conflict.sections.map((s) => ({ ...s })) }); version.current = conflict.updated_at; setConflict(null); }}>Load latest</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(true)}>Save mine anyway</button>
                </>
              )}
            >
              {conflict.deleted
                ? 'This handoff was deleted in another tab or device. Copy your edits if you want to keep them.'
                : 'This handoff was edited in another tab or device since you started. Your edits are still here.'}
            </Notice>
          )}
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={saving || conflict?.deleted} aria-busy={saving}>
              {saving ? <><span className="spinner spinner--light" /> Saving…</> : 'Save changes'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setDraft(null); setConflict(null); setSaveError(''); }} disabled={saving}>Cancel</button>
          </div>
        </div>
      ) : (
        <HandoffBody sections={handoff.sections} />
      )}

      {!draft && <ShareLinks handoff={handoff} hasPremium={hasPremium} />}
    </article>
  );
}
