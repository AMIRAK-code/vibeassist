import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, FileDown, PencilLine, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from './ui/toast-context';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { usePersistentState } from '../lib/usePersistentState';
import { formatDateTime } from '../lib/format';
import {
  bodyBlocks, countPlaceholders, DATA_OPTIONS, DOC_KINDS, EMPTY_INPUTS, fileName, kindLabel, MONETIZATION_OPTIONS,
  PLATFORM_OPTIONS, SERVICE_OPTIONS, toHtml, toMarkdown, toPlainText, validateInputs,
} from '../lib/legalDocs';
import Notice from './ui/Notice';
import Elapsed from './ui/Elapsed';

const DAILY_LIMIT = 30;

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Checkboxes({ legend, name, options, value, onChange, error }) {
  const toggle = (option) => onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  return (
    <fieldset className="field legal-checks" aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="field-label">{legend}</legend>
      <div className="check-grid">
        {options.map((o) => (
          <label key={o.value} className="check-row">
            <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} /> {o.label}
          </label>
        ))}
      </div>
      {error && <span id={`${name}-error`} className="field-error">{error}</span>}
    </fieldset>
  );
}

// A generated document, readable and editable. Edits only save over the version that was opened.
function DocumentView({ doc, onSaved, onDelete }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null); // sections while editing
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(null); // the newer version found while saving
  const version = useRef(doc.updated_at);
  const placeholders = countPlaceholders(doc);

  const startEdit = () => {
    version.current = doc.updated_at;
    setDraft(doc.sections.map((s) => ({ ...s })));
    setSaveError('');
    setConflict(null);
  };

  const save = async (overwrite = false) => {
    setSaving(true);
    setSaveError('');
    let query = supabase.from('legal_documents').update({ sections: draft }).eq('id', doc.id);
    if (!overwrite) query = query.eq('updated_at', version.current);
    const { data, error } = await query.select();
    if (!error && !data.length) {
      const { data: latest } = await supabase.from('legal_documents').select('*').eq('id', doc.id).maybeSingle();
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(doc));
      toast.show({ message: 'Copied as plain text.' });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser. Download the file instead.', tone: 'error' });
    }
  };

  return (
    <article className="card legal-doc" aria-labelledby="legal-doc-title">
      <div className="section-header">
        <div>
          <h3 id="legal-doc-title">{doc.title}</h3>
          <p className="field-help">{kindLabel(doc.kind)} · written by Claude ({doc.model ?? 'unknown model'}) · last changed {formatDateTime(doc.updated_at)}</p>
        </div>
        {!draft && (
          <div className="page-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={startEdit}><PencilLine aria-hidden="true" /> Edit</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copy}><Copy aria-hidden="true" /> Copy</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(fileName(doc, 'md'), toMarkdown(doc), 'text/markdown;charset=utf-8')}><FileDown aria-hidden="true" /> .md</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(fileName(doc, 'html'), toHtml(doc), 'text/html;charset=utf-8')}><FileDown aria-hidden="true" /> .html</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(doc)}><Trash2 aria-hidden="true" /> Delete</button>
          </div>
        )}
      </div>

      <Notice tone="warning">
        A starting draft written from your answers, not legal advice.{' '}
        {placeholders > 0 ? `Fill in the ${placeholders} [placeholder] ${placeholders === 1 ? 'gap' : 'gaps'}, then ` : 'Before you publish it, '}
        have a lawyer check it against how your app really works.
      </Notice>

      {draft ? (
        <div className="legal-edit">
          {draft.map((s, i) => (
            <div className="field" key={i}>
              <label className="field-label" htmlFor={`legal-section-${i}`}>{s.heading}</label>
              <textarea
                id={`legal-section-${i}`}
                className="input-field"
                rows={Math.min(14, Math.max(4, s.body.split('\n').length + 1))}
                value={s.body}
                onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
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
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onSaved(conflict); setDraft(conflict.sections.map((s) => ({ ...s }))); version.current = conflict.updated_at; setConflict(null); }}>Load latest</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(true)}>Save mine anyway</button>
                </>
              )}
            >
              {conflict.deleted
                ? 'This document was deleted in another tab or device. Copy your edits if you want to keep them.'
                : 'This document was edited in another tab or device since you started. Your edits are still here.'}
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
        <div className="legal-body">
          {doc.sections.map((s, i) => (
            <section key={i}>
              <h4>{s.heading}</h4>
              {bodyBlocks(s.body).map((b, j) => (b.type === 'ul'
                ? <ul key={j}>{b.items.map((item, k) => <li key={k}>{item}</li>)}</ul>
                : <p key={j}>{b.text}</p>))}
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

export default function LegalGenerator() {
  const { user, profile, hasPremium } = useAuth();
  const toast = useToast();
  const [kind, setKind] = usePersistentState('legal-kind', 'privacy');
  const [inputs, setInputs] = usePersistentState('legal-inputs', {
    ...EMPTY_INPUTS,
    developerName: profile?.name ?? '',
    contactEmail: user?.email ?? '',
  });
  const [errors, setErrors] = useState({});
  const [docs, setDocs] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [requestsLeft, setRequestsLeft] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState(null);
  const [genError, setGenError] = useState(null);
  const abort = useRef(null);
  const formRef = useRef(null);

  const load = useCallback(async () => {
    const [list, usage] = await Promise.all([
      supabase.from('legal_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 864e5).toISOString()),
    ]);
    if (list.error) {
      setLoadError(friendlyError(list.error, 'Could not load your documents.'));
      setDocs((d) => d ?? []);
      return;
    }
    setLoadError('');
    setDocs(list.data);
    setRequestsLeft(Math.max(0, DAILY_LIMIT - (usage.count ?? 0)));
  }, []);

  useEffect(() => {
    if (!hasPremium) return undefined;
    load();
    return () => abort.current?.abort();
  }, [hasPremium, load]);

  if (!hasPremium) {
    return (
      <div className="card card--raised legal-gate">
        <div className="source-head">
          <ShieldAlert aria-hidden="true" />
          <div>
            <h3 className="card-title">Legal Document Generator</h3>
            <p className="card-subtitle">Draft a privacy policy, terms of service or EULA tailored to your app's platforms, data and business model.</p>
          </div>
          <span className="badge badge--cobalt">Premium</span>
        </div>
        <div className="page-actions" style={{ marginTop: 14 }}>
          <Link className="btn btn-primary" to="/premium?from=/publishing">See Premium plans</Link>
        </div>
      </div>
    );
  }

  const set = (key) => (value) => setInputs({ ...inputs, [key]: value });
  const field = (key) => (e) => setInputs({ ...inputs, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const selected = docs?.find((d) => d.id === selectedId) ?? docs?.[0] ?? null;
  const outOfRequests = requestsLeft === 0;

  const generate = async (e) => {
    e.preventDefault();
    if (pending) return;
    const found = validateInputs(inputs);
    setErrors(found);
    if (Object.keys(found).length) {
      // After the error messages render, move to the first field that needs fixing
      setTimeout(() => {
        formRef.current?.querySelector('input[aria-invalid="true"], fieldset[aria-invalid="true"] input')?.focus();
      }, 0);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setGenError(null);
    setPending({ since: Date.now() });
    const { data, status, aborted } = await callFunction('legal-docs', { kind, inputs }, { signal: controller.signal });
    setPending(null);
    if (aborted) {
      toast.show({ message: 'Stopped waiting. If Claude finishes anyway, the draft will appear in your documents.' });
      setTimeout(load, 60_000);
      return;
    }
    if (status !== 200) {
      setGenError(data?.error === 'not_configured' ? { notConfigured: true } : { text: data?.error ?? 'The draft could not be written. Nothing was saved. Try again.' });
      load();
      return;
    }
    setSelectedId(data.document.id);
    await load();
    toast.show({ message: `${kindLabel(kind)} drafted. Read it through and fill in any placeholders.` });
  };

  const remove = async (doc) => {
    const { error } = await supabase.from('legal_documents').delete().eq('id', doc.id);
    if (error) {
      toast.show({ message: friendlyError(error, 'Could not delete the document. Try again.'), tone: 'error' });
      return;
    }
    if (selectedId === doc.id) setSelectedId(null);
    await load();
    toast.show({
      message: `Deleted “${doc.title}”.`,
      actionLabel: 'Undo',
      onAction: async () => {
        const { id, kind: docKind, title, inputs: docInputs, sections, model, created_at } = doc;
        const { error: undoError } = await supabase.from('legal_documents').insert({ id, kind: docKind, title, inputs: docInputs, sections, model, created_at });
        if (undoError) toast.show({ message: 'Could not restore the document. Generate it again instead.', tone: 'error' });
        else setSelectedId(id);
        await load();
      },
    });
  };

  const input = (key, label, props = {}) => (
    <div className="field">
      <label className="field-label" htmlFor={`legal-${key}`}>{label}</label>
      <input id={`legal-${key}`} className="input-field" value={inputs[key]} onChange={field(key)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `legal-${key}-error` : undefined} {...props} />
      {errors[key] && <span id={`legal-${key}-error`} className="field-error">{errors[key]}</span>}
    </div>
  );

  return (
    <div className="legal-generator">
      {loadError && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice>}

      <form className="card" onSubmit={generate} noValidate ref={formRef} aria-labelledby="legal-form-title">
        <h3 id="legal-form-title" className="card-title">Tell us about the app</h3>
        <p className="card-subtitle">Claude drafts the document from these answers only. Anything you leave out becomes a [placeholder] to fill in.</p>

        <div className="field" style={{ marginTop: 14 }}>
          <span className="field-label" id="legal-kind-label">Document</span>
          <div className="segmented" role="group" aria-labelledby="legal-kind-label">
            {DOC_KINDS.map((k) => (
              <button key={k.value} type="button" aria-pressed={kind === k.value} onClick={() => setKind(k.value)} disabled={Boolean(pending)}>{k.label}</button>
            ))}
          </div>
        </div>

        <div className="grid-3">
          {input('appName', 'App name', { maxLength: 80, placeholder: 'Focus Timer' })}
          {input('developerName', 'Published by', { maxLength: 120, placeholder: 'Your name or company', autoComplete: 'organization' })}
          {input('contactEmail', 'Contact email', { type: 'email', maxLength: 160, autoComplete: 'email' })}
          {input('country', 'Based in (country)', { maxLength: 60, placeholder: 'Italy', autoComplete: 'country-name' })}
          {input('website', 'Website (optional)', { type: 'url', maxLength: 200, placeholder: 'https://' })}
          {input('effectiveDate', 'Effective date (optional)', { type: 'date' })}
        </div>

        <Checkboxes legend="Platforms" name="platforms" options={PLATFORM_OPTIONS} value={inputs.platforms} onChange={set('platforms')} error={errors.platforms} />
        <Checkboxes legend="How it makes money" name="monetization" options={MONETIZATION_OPTIONS} value={inputs.monetization} onChange={set('monetization')} error={errors.monetization} />
        <Checkboxes legend="Data the app collects" name="data" options={DATA_OPTIONS} value={inputs.data} onChange={set('data')} />
        <Checkboxes legend="Third-party services it uses" name="services" options={SERVICE_OPTIONS} value={inputs.services} onChange={set('services')} />

        <div className="grid-2">
          {input('otherServices', 'Other services (optional)', { maxLength: 200, placeholder: 'For example OneSignal, Mapbox' })}
          {input('accountDeletion', 'How users delete their account or data (optional)', { maxLength: 300, placeholder: 'Settings → Delete account, or email us' })}
        </div>
        <label className="check-row" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={inputs.children} onChange={field('children')} /> The app is aimed at children under 13
        </label>

        {genError && (
          <div style={{ marginTop: 14 }}>
            {genError.notConfigured ? (
              <Notice tone="warning" title="The generator isn't set up for this app yet">
                The <code>ANTHROPIC_API_KEY</code> secret is missing in Supabase (Edge Functions → Secrets). Nothing was sent to Claude and nothing was saved.
              </Notice>
            ) : (
              <Notice tone="error" actions={<button type="submit" className="btn btn-secondary btn-sm"><RotateCcw aria-hidden="true" /> Try again</button>}>{genError.text}</Notice>
            )}
          </div>
        )}

        <div className="page-actions" style={{ marginTop: 16 }}>
          {pending ? (
            <>
              <button type="button" className="btn btn-primary" disabled aria-busy="true"><span className="spinner spinner--light" /> Drafting… <Elapsed since={pending.since} /></button>
              <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>Cancel</button>
              <span className="field-help">Usually 30 to 90 seconds.</span>
            </>
          ) : (
            <>
              <button type="submit" className="btn btn-primary" disabled={outOfRequests}>Generate {kindLabel(kind)}</button>
              {requestsLeft !== null && (
                <span className="field-help">{outOfRequests ? `You've used all ${DAILY_LIMIT} AI requests for today.` : `${requestsLeft} of ${DAILY_LIMIT} AI requests left today`}</span>
              )}
            </>
          )}
        </div>
        <p className="field-help" style={{ marginTop: 8 }}>Your answers are sent to Anthropic's Claude only when you press Generate.</p>
      </form>

      {docs === null ? (
        <div className="skeleton section" style={{ height: 120 }} aria-busy="true" aria-label="Loading your documents" />
      ) : docs.length > 0 && (
        <div className="legal-docs section">
          <ul className="card card--flush legal-doc-list" aria-label="Your documents">
            {docs.map((d) => (
              <li key={d.id}>
                <button type="button" aria-current={selected?.id === d.id ? 'true' : undefined} onClick={() => setSelectedId(d.id)}>
                  <strong>{d.title}</strong>
                  <span className="field-help">{kindLabel(d.kind)} · {formatDateTime(d.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <DocumentView
              key={selected.id}
              doc={selected}
              onSaved={(updated) => setDocs((list) => list.map((d) => (d.id === updated.id ? updated : d)))}
              onDelete={remove}
            />
          )}
        </div>
      )}
    </div>
  );
}
