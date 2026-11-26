import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Copy, FileDown, PencilLine, RotateCcw, Sparkles, Trash2, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from './ui/toast-context';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { usePersistentState } from '../lib/usePersistentState';
import { formatDateTime } from '../lib/format';
import { download } from '../lib/download';
import { completeWithUserAi, useImportedAi } from '../lib/aiClient';
import {
  applyPlaceholderReplacements, auditLegalDocument, bodyBlocks, buildDeterministicDraft,
  countPlaceholders, DATA_OPTIONS, dbKindFor, DOC_KINDS, effectiveKind, EMPTY_INPUTS,
  extractPlaceholders, fileName, JURISDICTION_OPTIONS, kindLabel, MONETIZATION_OPTIONS,
  PLATFORM_OPTIONS, SERVICE_OPTIONS, toHtml, toMarkdown, toPlainText, validateInputs,
} from '../lib/legalDocs';
import Notice from './ui/Notice';
import Elapsed from './ui/Elapsed';
import ModelSelectorPill from './ModelSelectorPill';

const DAILY_LIMIT = 30;

function Checkboxes({ legend, name, options, value, onChange, error }) {
  const safeVal = value ?? [];
  const toggle = (option) => onChange(safeVal.includes(option) ? safeVal.filter((v) => v !== option) : [...safeVal, option]);
  return (
    <fieldset className="field legal-checks" aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="field-label">{legend}</legend>
      <div className="check-grid">
        {options.map((o) => (
          <label key={o.value} className="check-row">
            <input type="checkbox" checked={safeVal.includes(o.value)} onChange={() => toggle(o.value)} /> {o.label}
          </label>
        ))}
      </div>
      {error && <span id={`${name}-error`} className="field-error">{error}</span>}
    </fieldset>
  );
}

function DocumentView({ doc, onSaved, onDelete }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [fills, setFills] = useState({});
  const version = useRef(doc.updated_at);
  const placeholders = useMemo(() => extractPlaceholders(doc), [doc]);
  const placeholderCount = countPlaceholders(doc);
  const auditChecks = useMemo(() => auditLegalDocument(doc, doc.inputs), [doc]);
  const docKind = effectiveKind(doc);

  const startEdit = () => {
    version.current = doc.updated_at;
    setDraft(doc.sections.map((s) => ({ ...s })));
    setSaveError('');
    setConflict(null);
  };

  const persistSections = async (sectionsToSave, overwrite = false) => {
    setSaving(true);
    setSaveError('');
    let query = supabase.from('legal_documents').update({ sections: sectionsToSave }).eq('id', doc.id);
    if (!overwrite) query = query.eq('updated_at', version.current);
    const { data, error } = await query.select();
    if (!error && !data.length) {
      const { data: latest } = await supabase.from('legal_documents').select('*').eq('id', doc.id).maybeSingle();
      setSaving(false);
      setConflict(latest ?? { deleted: true });
      return false;
    }
    setSaving(false);
    if (error) {
      setSaveError(friendlyError(error, 'Could not save. Try again.'));
      return false;
    }
    setDraft(null);
    setConflict(null);
    toast.show({ message: 'Changes saved.' });
    onSaved(data[0]);
    return true;
  };

  const applyFills = async (e) => {
    e.preventDefault();
    const updated = applyPlaceholderReplacements(doc.sections, fills);
    version.current = doc.updated_at;
    const ok = await persistSections(updated, true);
    if (ok) setFills({});
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
          <p className="field-help">
            {kindLabel(docKind)} · {doc.model ? `drafted by ${doc.model}` : 'structured template'} · last changed {formatDateTime(doc.updated_at)}
          </p>
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
        Starting draft generated from your answers—not formal legal advice.{' '}
        {placeholderCount > 0 ? `Fill in the ${placeholderCount} [placeholder] ${placeholderCount === 1 ? 'gap' : 'gaps'} below, then ` : 'Before publishing, '}
        have a qualified lawyer review it against your exact app behavior.
      </Notice>

      <div className="compliance-audit-bar" role="region" aria-label="Clause compliance audit">
        {auditChecks.map((chk) => (
          <div key={chk.id} className={`audit-chip${chk.ok ? ' is-ok' : ' is-warn'}`} title={chk.hint}>
            {chk.ok ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
            <span>{chk.label}</span>
          </div>
        ))}
      </div>

      {!draft && placeholders.length > 0 && (
        <form className="card card--flush placeholder-filler" onSubmit={applyFills}>
          <div style={{ padding: '14px 16px' }}>
            <h4 className="card-title">Quick-fill {placeholders.length} placeholder{placeholders.length === 1 ? '' : 's'}</h4>
            <div className="grid-2" style={{ marginTop: 10 }}>
              {placeholders.map((token) => (
                <div className="field" key={token}>
                  <label className="field-label" htmlFor={`fill-${token}`}>{token}</label>
                  <input
                    id={`fill-${token}`}
                    className="input-field input-sm"
                    placeholder={`Replace ${token}…`}
                    value={fills[token] ?? ''}
                    onChange={(e) => setFills((prev) => ({ ...prev, [token]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={saving || !Object.values(fills).some((v) => v?.trim())}>
              {saving ? 'Applying…' : 'Apply replacements'}
            </button>
          </div>
        </form>
      )}

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
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => persistSections(draft, true)}>Save mine anyway</button>
                </>
              )}
            >
              {conflict.deleted
                ? 'This document was deleted in another tab or device. Copy your edits if you want to keep them.'
                : 'This document was edited in another tab or device since you started. Your edits are still here.'}
            </Notice>
          )}
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => persistSections(draft, false)} disabled={saving || conflict?.deleted} aria-busy={saving}>
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
  const { active: importedAi } = useImportedAi('legal');

  const [kind, setKind] = usePersistentState('legal-kind', 'privacy');
  const [draftMode, setDraftMode] = usePersistentState('legal-mode', 'auto'); // auto | template
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
    const timer = setTimeout(() => { load(); }, 0);
    return () => {
      clearTimeout(timer);
      abort.current?.abort();
    };
  }, [load]);

  const set = (key) => (value) => setInputs({ ...inputs, [key]: value });
  const field = (key) => (e) => setInputs({ ...inputs, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const selected = docs?.find((d) => d.id === selectedId) ?? docs?.[0] ?? null;
  const outOfRequests = requestsLeft === 0 && !importedAi && draftMode !== 'template';
  const useCloudNative = Boolean(hasPremium && !importedAi && ['privacy', 'terms', 'eula'].includes(kind) && draftMode !== 'template');

  const saveClientDoc = async (docKind, cleanInputs, parsed, modelLabel) => {
    const { data, error } = await supabase
      .from('legal_documents')
      .insert({
        kind: dbKindFor(docKind),
        title: String(parsed.title || `${kindLabel(docKind)} for ${cleanInputs.appName}`).slice(0, 200),
        inputs: { ...cleanInputs, docKind },
        sections: parsed.sections,
        model: modelLabel,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const generate = async (e) => {
    e.preventDefault();
    if (pending) return;
    const found = validateInputs(inputs);
    setErrors(found);
    if (Object.keys(found).length) {
      setTimeout(() => {
        formRef.current?.querySelector('input[aria-invalid="true"], fieldset[aria-invalid="true"] input')?.focus();
      }, 0);
      return;
    }

    const controller = new AbortController();
    abort.current = controller;
    setGenError(null);
    setPending({ since: Date.now() });

    try {
      // Path A: Instant deterministic structured template (zero network AI)
      if (draftMode === 'template' || (!importedAi && !useCloudNative)) {
        const draft = buildDeterministicDraft(kind, inputs);
        const saved = await saveClientDoc(kind, inputs, draft, 'VibeAssist Template');
        setPending(null);
        setSelectedId(saved.id);
        await load();
        toast.show({ message: `${kindLabel(kind)} built from structured clauses. Fill in any remaining placeholders.` });
        return;
      }

      // Path B: User's Imported BYOK / Local AI
      if (importedAi) {
        const systemPrompt = [
          'You draft clear, plain-English legal starting drafts for indie software developers.',
          'Return ONLY valid JSON with shape {"title": string, "sections": [{"heading": string, "body": string}]}.',
          'Use plain text paragraphs separated by blank lines and bullet lists starting with "- ". Never invent fake business entities or statistics—use [placeholder] tags for missing facts.',
          `Target frameworks: ${(inputs.jurisdictions ?? []).join(', ') || 'standard web/app disclosures'}.`,
        ];
        const userPrompt = `Draft a ${kindLabel(kind)} for:\n${JSON.stringify(inputs, null, 2)}`;
        const aiRes = await completeWithUserAi({
          connection: importedAi,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          jsonMode: true,
          maxTokens: 2800,
          signal: controller.signal,
        });
        const sections = (aiRes.data?.sections ?? [])
          .map((s) => ({ heading: String(s.heading ?? '').trim().slice(0, 200), body: String(s.body ?? '').trim().slice(0, 12000) }))
          .filter((s) => s.heading && s.body);
        if (!sections.length) throw new Error('The AI returned an empty draft. Try Structured Template mode.');
        const saved = await saveClientDoc(kind, inputs, { title: aiRes.data?.title, sections }, `${importedAi.label} · ${aiRes.model}`);
        setPending(null);
        setSelectedId(saved.id);
        await load();
        toast.show({ message: `${kindLabel(kind)} drafted with ${importedAi.label}.` });
        return;
      }

      // Path C: VibeAssist Cloud Claude (Premium)
      const { data, status, aborted } = await callFunction('legal-docs', { kind, inputs }, { signal: controller.signal });
      setPending(null);
      if (aborted) {
        toast.show({ message: 'Stopped waiting. If Claude finishes anyway, the draft will appear in your documents.' });
        setTimeout(load, 60_000);
        return;
      }
      if (status !== 200) {
        setGenError(data?.error === 'not_configured' ? { notConfigured: true } : { text: data?.error ?? 'The draft could not be written. Nothing was saved.' });
        load();
        return;
      }
      setSelectedId(data.document.id);
      await load();
      toast.show({ message: `${kindLabel(kind)} drafted. Read it through and fill in any placeholders.` });
    } catch (err) {
      setPending(null);
      if (err?.name !== 'AbortError') {
        setGenError({ text: err?.message || 'Could not generate or save the draft.' });
      }
    }
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
        if (undoError) toast.show({ message: 'Could not restore the document.', tone: 'error' });
        else setSelectedId(id);
        await load();
      },
    });
  };

  const input = (key, label, props = {}) => (
    <div className="field">
      <label className="field-label" htmlFor={`legal-${key}`}>{label}</label>
      <input id={`legal-${key}`} className="input-field" value={inputs[key] ?? ''} onChange={field(key)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `legal-${key}-error` : undefined} {...props} />
      {errors[key] && <span id={`legal-${key}-error`} className="field-error">{errors[key]}</span>}
    </div>
  );

  return (
    <div className="legal-generator">
      {loadError && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice>}

      <ModelSelectorPill feature="legal" hasPremium={hasPremium} />

      <form className="card" onSubmit={generate} noValidate ref={formRef} aria-labelledby="legal-form-title" style={{ marginTop: 12 }}>
        <div className="section-header">
          <div>
            <h3 id="legal-form-title" className="card-title">Legal Document Studio</h3>
            <p className="card-subtitle">Generate 7 compliance documents from your stack answers using your own AI, VibeAssist Cloud, or instant structured clauses.</p>
          </div>
          <div className="segmented" role="group" aria-label="Generation engine">
            <button type="button" aria-pressed={draftMode === 'auto'} onClick={() => setDraftMode('auto')}>
              <Sparkles aria-hidden="true" style={{ width: 14, height: 14 }} /> {importedAi || hasPremium ? 'AI-Tailored' : 'Smart Template'}
            </button>
            <button type="button" aria-pressed={draftMode === 'template'} onClick={() => setDraftMode('template')}>
              Instant Template
            </button>
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <span className="field-label" id="legal-kind-label">Document type (7 supported)</span>
          <div className="segmented segmented--wrap" role="group" aria-labelledby="legal-kind-label">
            {DOC_KINDS.map((k) => (
              <button key={k.value} type="button" aria-pressed={kind === k.value} onClick={() => setKind(k.value)} disabled={Boolean(pending)}>
                {k.label}
              </button>
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
        <Checkboxes legend="Compliance & Jurisdiction Frameworks" name="jurisdictions" options={JURISDICTION_OPTIONS} value={inputs.jurisdictions} onChange={set('jurisdictions')} />
        <Checkboxes legend="How it makes money" name="monetization" options={MONETIZATION_OPTIONS} value={inputs.monetization} onChange={set('monetization')} error={errors.monetization} />
        <Checkboxes legend="Data the app collects" name="data" options={DATA_OPTIONS} value={inputs.data} onChange={set('data')} />
        <Checkboxes legend="Third-party services & AI processors" name="services" options={SERVICE_OPTIONS} value={inputs.services} onChange={set('services')} />

        <div className="grid-2">
          {input('otherServices', 'Other services (optional)', { maxLength: 200, placeholder: 'For example OneSignal, Mapbox' })}
          {input('accountDeletion', 'How users delete their account or data (optional)', { maxLength: 300, placeholder: 'Settings → Delete account, or email us' })}
        </div>
        <label className="check-row" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={Boolean(inputs.children)} onChange={field('children')} /> The app is aimed at children under 13
        </label>

        {genError && (
          <div style={{ marginTop: 14 }}>
            {genError.notConfigured ? (
              <Notice tone="warning" title="VibeAssist Cloud Claude isn't configured on this deployment">
                Switch to <strong>Instant Template</strong> above or import your own Gemini / Claude / OpenAI / Ollama key in <strong>Import Your AI</strong>.
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
            </>
          ) : (
            <>
              <button type="submit" className="btn btn-primary" disabled={outOfRequests}>
                {draftMode === 'template' || (!importedAi && !useCloudNative)
                  ? `Build ${kindLabel(kind)} (Instant)`
                  : `Draft ${kindLabel(kind)} with ${importedAi ? importedAi.label : 'Claude'}`}
              </button>
              {useCloudNative && requestsLeft !== null && (
                <span className="field-help">{outOfRequests ? `You've used all ${DAILY_LIMIT} cloud AI requests today.` : `${requestsLeft} of ${DAILY_LIMIT} cloud requests left today`}</span>
              )}
            </>
          )}
        </div>
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
                  <span className="field-help">{kindLabel(effectiveKind(d))} · {formatDateTime(d.created_at)}</span>
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
