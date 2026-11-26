import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Apple, ArrowRight, ExternalLink, FileCheck2, FileDown, Laptop,
  Monitor, ShieldAlert, ShieldCheck, Smartphone, TerminalSquare,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import { supabase } from '../lib/supabase';
import { isoDay } from '../lib/metrics';
import { download } from '../lib/download';
import { usePersistentState } from '../lib/usePersistentState';
import { CARD_ORDER, LAST_REVIEWED, PLATFORMS } from '../lib/launchChecklist';
import { useImportedAi } from '../lib/aiClient';
import PageHeader from '../components/ui/PageHeader';
import LegalGenerator from '../components/LegalGenerator';
import StorePrivacyBuilder from '../components/StorePrivacyBuilder';
import SecurityCenter from '../components/SecurityCenter';

const ICONS = {
  ios: Apple,
  android: Smartphone,
  windows: Monitor,
  web: TerminalSquare,
  mac: Laptop,
  ai_safety: ShieldCheck,
};

const TABS = [
  { id: 'checklists', label: 'Store & AI Checklists' },
  { id: 'legal', label: 'Legal Document Studio' },
  { id: 'manifests', label: 'Privacy Manifests' },
  { id: 'security', label: 'Security Lab' },
];

export default function Publishing() {
  const { user, profile, refreshAccount } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { active: activeAi } = useImportedAi('legal');

  const urlTab = searchParams.get('tab');
  const [storedTab, setStoredTab] = usePersistentState('publishing-tab', 'checklists');
  const activeTab = TABS.some((t) => t.id === urlTab) ? urlTab : storedTab;

  const setTab = (id) => {
    setStoredTab(id);
    setSearchParams({ tab: id }, { replace: true });
  };

  const [platformId, setPlatformId] = usePersistentState('launch-platform', 'ios');
  const [itemFilter, setItemFilter] = useState('all'); // all | required | remaining | done
  const [checklist, setChecklist] = useState(() => profile?.launch_checklist ?? {});
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const failed = useRef(new Map());
  const guideRef = useRef(null);

  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];
  const doneIn = (p) => p.items.filter((item) => checklist[item.key]).length;
  const totalItems = useMemo(() => PLATFORMS.reduce((n, p) => n + p.items.length, 0), []);
  const totalDone = useMemo(() => PLATFORMS.reduce((n, p) => n + p.items.filter((i) => checklist[i.key]).length, 0), [checklist]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (profile?.launch_checklist) setChecklist(profile.launch_checklist);
    }, 0);
    return () => clearTimeout(t);
  }, [profile?.launch_checklist]);

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

  const visibleItems = platform.items.filter((item) => {
    const done = Boolean(checklist[item.key]);
    if (itemFilter === 'required') return item.priority === 'required';
    if (itemFilter === 'remaining') return !done;
    if (itemFilter === 'done') return done;
    return true;
  });

  const exportChecklist = () => {
    const lines = [
      '# VibeAssist Launch & Compliance Checklist',
      '',
      ...PLATFORMS.flatMap((p) => [
        `## ${p.title} (${doneIn(p)}/${p.items.length})`,
        ...p.items.map((item) => `- [${checklist[item.key] ? 'x' : ' '}] ${item.text} (${item.priority}) — ${item.source}`),
        '',
      ]),
    ];
    download('launch-compliance-checklist.md', lines.join('\n'), 'text/markdown;charset=utf-8');
  };

  return (
    <>
      <PageHeader
        title="Legal, Security & Compliance Hub"
        description="Store launch checklists, 7 legal document templates, Apple Privacy Manifests, and browser-native secret & CVE scanning."
      >
        <button type="button" className="btn btn-secondary" onClick={exportChecklist}>
          <FileDown aria-hidden="true" /> Export Checklist
        </button>
        <Link to="/ai-models" className="btn btn-ghost">
          AI Models
        </Link>
      </PageHeader>

      <div className="stat-grid section" style={{ marginTop: 0 }}>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">Readiness Checklists</span>
            <FileCheck2 className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value">{totalDone} / {totalItems}</p>
          <p className="stat-change">{Math.round((totalDone / Math.max(1, totalItems)) * 100)}% complete across {PLATFORMS.length} tracks</p>
        </div>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">Store Manifests</span>
            <ShieldAlert className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value" style={{ fontSize: 18 }}>iOS + Play</p>
          <p className="stat-change">PrivacyInfo.xcprivacy XML &amp; Data Safety builder ready</p>
        </div>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">Security Lab</span>
            <ShieldCheck className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value" style={{ fontSize: 18 }}>Local + OSV.dev</p>
          <p className="stat-change">14+ secret regexes, CVE lookup &amp; CSP headers</p>
        </div>
        <div className="card stat">
          <div className="stat-head">
            <span className="stat-label">Legal AI Drafter</span>
            <TerminalSquare className="stat-icon" aria-hidden="true" />
          </div>
          <p className="stat-value" style={{ fontSize: 18 }}>{activeAi ? activeAi.label : 'Structured / Cloud'}</p>
          <p className="stat-change">{activeAi ? activeAi.defaultModel : '7 document types ready'}</p>
        </div>
      </div>

      <div className="segmented segmented--wrap section" role="tablist" aria-label="Compliance hub sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            aria-pressed={activeTab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'checklists' && (
        <div className="section">
          <div className="grid-3 platform-cards">
            {CARD_ORDER.map((id) => {
              const p = PLATFORMS.find((x) => x.id === id);
              const Icon = ICONS[id] ?? TerminalSquare;
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
              <div className="segmented segmented--wrap" role="group" aria-label="Platform">
                {CARD_ORDER.map((id) => {
                  const p = PLATFORMS.find((x) => x.id === id);
                  return <button key={id} type="button" aria-pressed={p.id === platform.id} onClick={() => setPlatformId(p.id)}>{p.label}</button>;
                })}
              </div>

              <div className="page-actions">
                <div className="segmented" role="group" aria-label="Filter items">
                  <button type="button" aria-pressed={itemFilter === 'all'} onClick={() => setItemFilter('all')}>All</button>
                  <button type="button" aria-pressed={itemFilter === 'required'} onClick={() => setItemFilter('required')}>Required</button>
                  <button type="button" aria-pressed={itemFilter === 'remaining'} onClick={() => setItemFilter('remaining')}>Remaining</button>
                  <button type="button" aria-pressed={itemFilter === 'done'} onClick={() => setItemFilter('done')}>Done</button>
                </div>
                <span className={`save-status${status === 'error' ? ' save-status--error' : ''}`} role="status" aria-live="polite">
                  {status === 'saving' && <><span className="spinner" /> Saving…</>}
                  {status === 'saved' && 'Saved'}
                  {status === 'error' && (
                    <>
                      Not saved.
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => persist([...failed.current.entries()])}>Retry</button>
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="card">
              <div className="section-header">
                <h2 id="checklist-title">{platform.title}</h2>
                <span className="badge">{doneIn(platform)} of {platform.items.length} done</span>
              </div>
              {visibleItems.length === 0 ? (
                <p className="muted" style={{ marginTop: 10 }}>No items match the current filter.</p>
              ) : (
                <ul className="checklist">
                  {visibleItems.map((item) => (
                    <li key={item.key}>
                      <label className="check-row">
                        <input type="checkbox" checked={Boolean(checklist[item.key])} onChange={() => toggle(item.key)} />
                        <span>
                          <span className={`checklist-text${checklist[item.key] ? ' is-done' : ''}`}>
                            {item.text}{' '}
                            {item.priority === 'required' && <span className="badge badge--warning" style={{ fontSize: 11, marginLeft: 4 }}>Required</span>}
                          </span>
                          <span className="checklist-detail">{item.detail}</span>
                        </span>
                      </label>
                      <a href={item.source} target="_blank" rel="noreferrer" className="checklist-source">
                        Official source <ExternalLink aria-hidden="true" /><span className="visually-hidden"> for “{item.text}” (opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="field-help section">
              Last reviewed {LAST_REVIEWED}. Store rules change; the linked pages are the authority, and this isn't legal advice.
            </p>
          </section>
        </div>
      )}

      {activeTab === 'legal' && (
        <section className="section" aria-labelledby="legal-title">
          <h2 id="legal-title" className="visually-hidden">Legal Document Studio</h2>
          <LegalGenerator />
        </section>
      )}

      {activeTab === 'manifests' && (
        <section className="section" aria-labelledby="manifests-title">
          <h2 id="manifests-title" className="visually-hidden">Store Privacy Manifests</h2>
          <StorePrivacyBuilder />
        </section>
      )}

      {activeTab === 'security' && (
        <section className="section" aria-labelledby="security-lab-title">
          <h2 id="security-lab-title" className="visually-hidden">Security &amp; Vulnerability Lab</h2>
          <SecurityCenter />
        </section>
      )}
    </>
  );
}
