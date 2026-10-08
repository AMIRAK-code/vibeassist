import React, { useEffect, useRef, useState } from 'react';
import { Apple, ArrowRight, ExternalLink, Monitor, Smartphone, TerminalSquare } from 'lucide-react';
import { useAuth } from '../context/auth';
import { supabase } from '../lib/supabase';
import { isoDay } from '../lib/metrics';
import { usePersistentState } from '../lib/usePersistentState';
import { CARD_ORDER, LAST_REVIEWED, PLATFORMS } from '../lib/launchChecklist';
import PageHeader from '../components/ui/PageHeader';
import LegalGenerator from '../components/LegalGenerator';

const ICONS = { ios: Apple, android: Smartphone, windows: Monitor, web: TerminalSquare };

export default function Publishing() {
  const { user, profile, refreshAccount } = useAuth();
  const [platformId, setPlatformId] = usePersistentState('launch-platform', 'ios');
  const [checklist, setChecklist] = useState(() => profile?.launch_checklist ?? {});
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const failed = useRef(new Map()); // key -> wanted state, for Retry
  const guideRef = useRef(null);
  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];
  const doneIn = (p) => p.items.filter((item) => checklist[item.key]).length;

  useEffect(() => {
    if (profile?.launch_checklist) setChecklist(profile.launch_checklist);
  }, [profile?.launch_checklist]);

  // Re-reads the latest checklist and merges this one change, so ticks made in another tab or
  // device are never overwritten. Only reports "saved" after the database confirms the write.
  const persist = async (changes) => {
    setStatus('saving');
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: latest, error: readError } = await supabase.from('profiles').select('launch_checklist, updated_at').eq('id', user.id).single();
      if (readError) break;
      const next = { ...latest.launch_checklist };
      for (const [key, wanted] of changes) {
        if (wanted) next[key] = next[key] ?? isoDay(new Date());
        else delete next[key];
      }
      const { data, error } = await supabase
        .from('profiles')
        .update({ launch_checklist: next })
        .eq('id', user.id)
        .eq('updated_at', latest.updated_at)
        .select('launch_checklist');
      if (error) break;
      if (data.length) {
        for (const [key] of changes) failed.current.delete(key);
        setChecklist(data[0].launch_checklist);
        setStatus('saved');
        refreshAccount();
        return;
      }
      // Someone else saved in between: read again and merge
    }
    for (const [key, wanted] of changes) failed.current.set(key, wanted);
    setStatus('error');
  };

  const toggle = (key) => {
    const wanted = !checklist[key];
    setChecklist((prev) => {
      const next = { ...prev };
      if (wanted) next[key] = isoDay(new Date());
      else delete next[key];
      return next;
    });
    persist([[key, wanted]]);
  };

  const openGuide = (id) => {
    setPlatformId(id);
    requestAnimationFrame(() => {
      guideRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      guideRef.current?.focus({ preventScroll: true });
    });
  };

  return (
    <>
      <PageHeader
        title="Publishing & Legal Center"
        description="What each store asks for before you publish, with links to the official rules, and drafts of your app's legal documents."
      />

      <div className="grid-2 platform-cards">
        {CARD_ORDER.map((id) => {
          const p = PLATFORMS.find((x) => x.id === id);
          const Icon = ICONS[id];
          const done = doneIn(p);
          return (
            <section key={id} className={`card platform-card${platformId === id ? ' is-selected' : ''}`} aria-labelledby={`platform-${id}`}>
              <div className="platform-card-head">
                <Icon aria-hidden="true" />
                <h2 id={`platform-${id}`} className="card-title">{p.card.title}</h2>
                <span className={`badge${done === p.items.length ? ' badge--success' : ''}`}>{done} of {p.items.length} done</span>
              </div>
              <p className="platform-card-summary">{p.card.summary}</p>
              <button type="button" className="btn btn-secondary w-full" onClick={() => openGuide(id)} aria-controls="checklist-section">
                {p.card.guide} <ArrowRight aria-hidden="true" />
              </button>
            </section>
          );
        })}
      </div>

      <section className="section" id="checklist-section" aria-labelledby="checklist-title" ref={guideRef} tabIndex={-1}>
        <div className="section-header">
          <div className="segmented" role="group" aria-label="Platform">
            {CARD_ORDER.map((id) => {
              const p = PLATFORMS.find((x) => x.id === id);
              return <button key={id} type="button" aria-pressed={p.id === platform.id} onClick={() => setPlatformId(p.id)}>{p.label}</button>;
            })}
          </div>
          <span className={`save-status${status === 'error' ? ' save-status--error' : ''}`} role="status" aria-live="polite">
            {status === 'saving' && <><span className="spinner" /> Saving…</>}
            {status === 'saved' && 'Saved to your account'}
            {status === 'error' && (
              <>
                Your last change wasn't saved.
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => persist([...failed.current.entries()])}>Retry</button>
              </>
            )}
          </span>
        </div>

        <div className="card">
          <div className="section-header">
            <h2 id="checklist-title">{platform.title}</h2>
            <span className="badge">{doneIn(platform)} of {platform.items.length} done</span>
          </div>
          <ul className="checklist">
            {platform.items.map((item) => (
              <li key={item.key}>
                <label className="check-row">
                  <input type="checkbox" checked={Boolean(checklist[item.key])} onChange={() => toggle(item.key)} />
                  <span>
                    <span className={`checklist-text${checklist[item.key] ? ' is-done' : ''}`}>{item.text}</span>
                    <span className="checklist-detail">{item.detail}</span>
                  </span>
                </label>
                <a href={item.source} target="_blank" rel="noreferrer" className="checklist-source">
                  Official source <ExternalLink aria-hidden="true" /><span className="visually-hidden"> for “{item.text}” (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <p className="field-help section">
          Last reviewed {LAST_REVIEWED}. Store rules change; the linked pages are the authority, and this isn't legal advice.
        </p>
      </section>

      <section className="section" aria-labelledby="legal-title">
        <div className="section-header">
          <h2 id="legal-title">Legal Document Generator</h2>
          <span className="field-help">Privacy policies, terms of service and EULAs tailored to your tech stack and business model.</span>
        </div>
        <LegalGenerator />
      </section>
    </>
  );
}
