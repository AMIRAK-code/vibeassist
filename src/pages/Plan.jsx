import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, FileDown, MessageSquare, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { fetchMetrics, formatDay, summarize } from '../lib/metrics';
import { usePersistentState } from '../lib/usePersistentState';
import { download } from '../lib/download';
import { PERIODS, PLAN_FOCUSES } from '../lib/options';
import { completeWithUserAi, useImportedAi } from '../lib/aiClient';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';
import Elapsed from '../components/ui/Elapsed';
import ContextPreview from '../components/ContextPreview';
import ModelSelectorPill from '../components/ModelSelectorPill';

const DAILY_LIMIT = 30;
const EFFORT_LABELS = { small: 'Under an hour', medium: 'A few hours', large: 'A day or more' };
const PLAN_SELECT = 'id, created_at, period_days, focus, summary, missing_data, context, model, plan_steps(id, position, title, detail, based_on, effort, status)';

const focusLabel = (value) => PLAN_FOCUSES.find((f) => f.value === (value ?? null))?.label ?? 'Whatever matters most';
const planDate = (iso) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
const sortSteps = (plan) => ({ ...plan, plan_steps: [...(plan.plan_steps ?? [])].sort((a, b) => a.position - b.position) });

const localStorageKey = (userId) => `vibeassist:local-plans:${userId ?? 'anon'}`;

function readLocalPlans(userId) {
  try {
    const raw = window.localStorage.getItem(localStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((p) => ({ ...p, local: true })) : [];
  } catch {
    return [];
  }
}

function writeLocalPlans(userId, list) {
  try {
    window.localStorage.setItem(localStorageKey(userId), JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }
}

function planAsText(plan) {
  const kept = plan.plan_steps.filter((s) => s.status === 'kept' || s.status === 'done');
  const steps = kept.length ? kept : plan.plan_steps.filter((s) => s.status !== 'dismissed');
  return [
    `# Weekly Plan · ${planDate(plan.created_at)} (last ${plan.period_days} days)`,
    '',
    plan.summary,
    '',
    ...steps.map((s, i) => `${i + 1}. ${s.status === 'done' ? '[x] ' : '[ ] '}**${s.title}**\n   ${s.detail}`),
    '',
    `Written by ${plan.model} in VibeAssist.`,
  ].join('\n');
}

function Step({ step, onStatus }) {
  const done = step.status === 'done';
  if (step.status === 'suggested') {
    return (
      <li className="plan-step plan-step--suggested">
        <div className="plan-step-body">
          <h4 className="plan-step-title">{step.title}</h4>
          <p className="plan-step-detail">{step.detail}</p>
          {step.based_on && <p className="plan-step-basis"><span>Based on</span> {step.based_on}</p>}
          <span className="badge">{EFFORT_LABELS[step.effort] ?? step.effort}</span>
        </div>
        <div className="plan-step-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStatus(step, 'kept')}>
            <Check aria-hidden="true" /> Keep<span className="visually-hidden">: {step.title}</span>
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onStatus(step, 'dismissed')}>
            <X aria-hidden="true" /> Dismiss<span className="visually-hidden">: {step.title}</span>
          </button>
        </div>
      </li>
    );
  }
  return (
    <li className={`plan-step${done ? ' plan-step--done' : ''}`}>
      <label className="check-row plan-step-check">
        <input type="checkbox" checked={done} onChange={() => onStatus(step, done ? 'kept' : 'done')} />
        <span className="plan-step-body">
          <span className="plan-step-title">{step.title}</span>
          <span className="plan-step-detail">{step.detail}</span>
          {step.based_on && <span className="plan-step-basis"><span>Based on</span> {step.based_on}</span>}
        </span>
      </label>
      <div className="plan-step-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onStatus(step, 'dismissed')}>
          Remove<span className="visually-hidden">: {step.title}</span>
        </button>
      </div>
    </li>
  );
}

export default function Plan() {
  const { user, profile, hasPremium } = useAuth();
  const toast = useToast();
  const { active: importedAi } = useImportedAi('plan');

  const [period, setPeriod] = usePersistentState('plan-period', 30);
  const [focus, setFocus] = usePersistentState('plan-focus', null);
  const [effortFilter, setEffortFilter] = useState('all');
  const [plans, setPlans] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [campaignCount, setCampaignCount] = useState(0);
  const [requestsLeft, setRequestsLeft] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState(null);
  const [genError, setGenError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customEffort, setCustomEffort] = useState('small');
  const [question, setQuestion] = usePersistentState('plan-question-draft', '');
  const [answers, setAnswers] = usePersistentState('plan-answers', []);
  const [askError, setAskError] = useState('');
  const abort = useRef(null);
  const askBox = useRef(null);

  const load = useCallback(async () => {
    const local = readLocalPlans(user?.id);
    const [plansRes, metricsRes, campaignsRes, usageRes] = await Promise.all([
      supabase.from('advisor_plans').select(PLAN_SELECT).order('created_at', { ascending: false }).limit(12),
      fetchMetrics(period * 2),
      supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }),
      supabase.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 864e5).toISOString()),
    ]);
    if (plansRes.error) {
      setLoadError(friendlyError(plansRes.error, 'Could not load cloud plans.'));
      setPlans(local.map(sortSteps));
      return;
    }
    setLoadError('');
    const merged = [...local, ...plansRes.data]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(sortSteps);
    setPlans(merged);
    setMetrics(metricsRes.data ?? []);
    setCampaignCount(campaignsRes.count ?? 0);
    setRequestsLeft(Math.max(0, DAILY_LIMIT - (usageRes.count ?? 0)));
  }, [period, user?.id]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 0);
    return () => {
      clearTimeout(t);
      abort.current?.abort();
    };
  }, [load]);

  const summary = useMemo(() => summarize(metrics, period), [metrics, period]);
  const plan = plans?.find((p) => p.id === selectedId) ?? plans?.[0] ?? null;
  const isLatest = plan && plans?.[0]?.id === plan.id;
  const matchesEffort = (s) => effortFilter === 'all' || s.effort === effortFilter;
  const suggested = plan?.plan_steps.filter((s) => s.status === 'suggested' && matchesEffort(s)) ?? [];
  const active = plan?.plan_steps.filter((s) => (s.status === 'kept' || s.status === 'done') && matchesEffort(s)) ?? [];
  const dismissed = plan?.plan_steps.filter((s) => s.status === 'dismissed') ?? [];
  const allDone = active.length > 0 && suggested.length === 0 && active.every((s) => s.status === 'done');

  const saveLocalPlanUpdate = (updatedPlan) => {
    const local = readLocalPlans(user?.id);
    const next = local.some((p) => p.id === updatedPlan.id)
      ? local.map((p) => (p.id === updatedPlan.id ? updatedPlan : p))
      : [updatedPlan, ...local];
    writeLocalPlans(user?.id, next);
  };

  const replaceStep = (planId, stepId, status) =>
    setPlans((list) => list.map((p) => (p.id !== planId ? p : { ...p, plan_steps: p.plan_steps.map((s) => (s.id === stepId ? { ...s, status } : s)) })));

  const setStatus = async (step, status, { silent = false } = {}) => {
    const planId = plan.id;
    const before = step.status;
    replaceStep(planId, step.id, status);

    if (plan.local || String(step.id).startsWith('local_')) {
      const updated = {
        ...plan,
        plan_steps: plan.plan_steps.map((s) => (s.id === step.id ? { ...s, status } : s)),
      };
      saveLocalPlanUpdate(updated);
      return;
    }

    const { error } = await supabase.from('plan_steps').update({ status }).eq('id', step.id);
    if (error) {
      replaceStep(planId, step.id, before);
      toast.show({ message: 'Could not save that change. Check your connection and try again.', tone: 'error' });
      return;
    }
    if (status === 'dismissed' && !silent) {
      toast.show({
        message: `${before === 'suggested' ? 'Dismissed' : 'Removed'} “${step.title}”.`,
        actionLabel: 'Undo',
        onAction: () => setStatus({ ...step, status: 'dismissed' }, before, { silent: true }),
      });
    }
  };

  const keepAll = async () => {
    for (const step of suggested) await setStatus(step, 'kept', { silent: true });
  };

  const addCustomStep = (e) => {
    e.preventDefault();
    const title = customTitle.trim();
    if (!title) return;
    const step = {
      id: `local_step_${Date.now()}`,
      position: (plan?.plan_steps?.length ?? 0) + 1,
      title,
      detail: 'Custom step added manually.',
      based_on: 'Founder priority',
      effort: customEffort,
      status: 'kept',
    };
    const targetPlan = plan?.local ? {
      ...plan,
      plan_steps: [...plan.plan_steps, step],
    } : {
      id: `local_plan_${Date.now()}`,
      local: true,
      created_at: new Date().toISOString(),
      period_days: period,
      focus,
      summary: 'Custom founder action checklist.',
      missing_data: [],
      context: { includes_sample: summary.sources.includes('sample') },
      model: 'Manual checklist',
      plan_steps: [step],
    };
    saveLocalPlanUpdate(targetPlan);
    setCustomTitle('');
    setSelectedId(targetPlan.id);
    load();
    toast.show({ message: 'Step added.' });
  };

  const generate = async () => {
    if (pending) return;
    const controller = new AbortController();
    abort.current = controller;
    setGenError(null);
    setPending({ kind: 'plan', since: Date.now(), who: importedAi ? importedAi.label : 'Claude' });

    if (importedAi) {
      try {
        const { current, previous } = summary;
        const promptContext = [
          `Period: last ${period} days (${profile?.currency ?? 'USD'}). Focus: ${focusLabel(focus)}.`,
          `Current: revenue ${current.revenue.toFixed(2)}, fees ${current.fees.toFixed(2)}, ad spend ${current.adSpend.toFixed(2)}, downloads ${current.downloads}, purchases ${current.purchases}.`,
          `Previous ${period} days: revenue ${previous.revenue.toFixed(2)}, ad spend ${previous.adSpend.toFixed(2)}, downloads ${previous.downloads}.`,
          `Campaigns tracked: ${campaignCount}. Experience: ${profile?.experience ?? 'Beginner'}. Goals: ${profile?.goals?.join('; ') || 'none'}.`,
          `Includes sample data: ${summary.sources.includes('sample') ? 'yes' : 'no'}.`,
        ].join('\n');

        const aiRes = await completeWithUserAi({
          connection: importedAi,
          system: [
            'Write a short weekly plan for an indie app developer.',
            'Return ONLY valid JSON: {"summary": string, "missing_data": string[], "steps": [{"title": string, "detail": string, "based_on": string, "effort": "small" | "medium" | "large"}]}.',
            'Provide 3 to 5 concrete steps grounded strictly in the metrics below.',
          ],
          messages: [{ role: 'user', content: promptContext }],
          jsonMode: true,
          maxTokens: 1600,
          signal: controller.signal,
        });
        const createdPlan = {
          id: `local_plan_${Date.now()}`,
          local: true,
          created_at: new Date().toISOString(),
          period_days: period,
          focus,
          summary: String(aiRes.data?.summary || 'Weekly priorities generated from your metrics.'),
          missing_data: Array.isArray(aiRes.data?.missing_data) ? aiRes.data.missing_data : [],
          context: { includes_sample: summary.sources.includes('sample') },
          model: `${importedAi.label} (${aiRes.model})`,
          plan_steps: (aiRes.data?.steps ?? []).slice(0, 6).map((s, idx) => ({
            id: `local_step_${Date.now()}_${idx}`,
            position: idx + 1,
            title: String(s.title ?? 'Next step').slice(0, 160),
            detail: String(s.detail ?? '').slice(0, 600),
            based_on: String(s.based_on ?? 'Your recent metrics').slice(0, 400),
            effort: ['small', 'medium', 'large'].includes(s.effort) ? s.effort : 'medium',
            status: 'suggested',
          })),
        };
        saveLocalPlanUpdate(createdPlan);
        setPending(null);
        setSelectedId(createdPlan.id);
        setAnswers([]);
        await load();
        toast.show({ message: `Plan generated with ${importedAi.label}. Keep the steps you want.` });
      } catch (err) {
        setPending(null);
        if (err?.name !== 'AbortError') setGenError({ text: err?.message || 'Could not write plan.' });
      }
      return;
    }

    const { data, status, aborted } = await callFunction('ai-advisor', { mode: 'plan', period_days: period, focus }, { signal: controller.signal });
    setPending(null);
    if (aborted) {
      toast.show({ message: 'Stopped waiting. If Claude finishes anyway, the plan will appear in your history.' });
      setTimeout(load, 60_000);
      return;
    }
    if (status !== 200) {
      setGenError(data?.error === 'not_configured' ? { notConfigured: true } : { text: data?.error ?? 'The plan could not be written.' });
      await load();
      return;
    }
    setSelectedId(data.plan.id);
    setAnswers([]);
    await load();
    toast.show({ message: 'New plan ready. Keep the steps you want to work on.' });
  };

  const ask = async (e) => {
    e.preventDefault();
    const text = question.trim();
    if (!text || pending) return;
    const controller = new AbortController();
    abort.current = controller;
    setAskError('');
    setPending({ kind: 'ask', since: Date.now(), who: importedAi ? importedAi.label : 'Claude' });
    const history = answers.flatMap((a) => [{ role: 'user', content: a.question }, { role: 'assistant', content: a.answer }]);

    if (importedAi) {
      try {
        const res = await completeWithUserAi({
          connection: importedAi,
          system: `Answer concisely based on this plan and metrics.\nPlan summary: ${plan?.summary ?? 'None'}\nRevenue (${period}d): ${summary.current.revenue.toFixed(2)}, Ad spend: ${summary.current.adSpend.toFixed(2)}, Downloads: ${summary.current.downloads}.`,
          messages: [...history, { role: 'user', content: text }],
          maxTokens: 700,
          signal: controller.signal,
        });
        setPending(null);
        setAnswers([...answers, { question: text, answer: res.text, model: `${importedAi.label} (${res.model})`, at: new Date().toISOString() }]);
        setQuestion('');
      } catch (err) {
        setPending(null);
        if (err?.name !== 'AbortError') setAskError(err?.message || 'No answer this time.');
      }
      return;
    }

    const { data, status, aborted } = await callFunction(
      'ai-advisor',
      { mode: 'ask', period_days: period, plan_id: plan?.id, messages: [...history, { role: 'user', content: text }] },
      { signal: controller.signal },
    );
    setPending(null);
    if (aborted) return;
    if (status !== 200) {
      setAskError(data?.error === 'not_configured' ? 'Import your own AI key or configure Anthropic in Supabase.' : `${data?.error ?? 'No answer this time.'}`);
      return;
    }
    setAnswers([...answers, { question: text, answer: data.reply, model: 'Claude', at: new Date().toISOString() }]);
    setQuestion('');
    load();
  };

  const copyPlan = async () => {
    try {
      await navigator.clipboard.writeText(planAsText(plan));
      toast.show({ message: 'Plan copied as Markdown.' });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser.', tone: 'error' });
    }
  };

  const deletePlan = async () => {
    if (plan.local) {
      const next = readLocalPlans(user?.id).filter((p) => p.id !== plan.id);
      writeLocalPlans(user?.id, next);
      setConfirmDelete(false);
      setSelectedId(null);
      await load();
      toast.show({ message: 'Plan deleted.' });
      return;
    }
    const { error } = await supabase.from('advisor_plans').delete().eq('id', plan.id);
    setConfirmDelete(false);
    if (error) {
      toast.show({ message: friendlyError(error, 'Could not delete the plan.'), tone: 'error' });
      return;
    }
    setSelectedId(null);
    await load();
    toast.show({ message: 'Plan deleted.' });
  };

  const askAboutStep = (step) => {
    setQuestion(`About “${step.title}”: `);
    askBox.current?.focus();
    askBox.current?.scrollIntoView({ block: 'center' });
  };

  if (plans === null) {
    return (
      <>
        <PageHeader title="Weekly Plan" description="A weekly plan written from your numbers. Keep the steps that make sense and tick them off." />
        <div className="skeleton" style={{ height: 180 }} aria-busy="true" aria-label="Loading your plans" />
      </>
    );
  }

  const outOfRequests = !importedAi && requestsLeft === 0;

  return (
    <>
      <PageHeader title="Weekly Plan" description="A weekly action plan grounded in your numbers, generated by your imported AI or VibeAssist Cloud." />

      {loadError && (
        <div className="section"><Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice></div>
      )}

      <div style={{ marginBottom: 12 }}>
        <ModelSelectorPill feature="plan" hasPremium={hasPremium} />
      </div>

      <section className="card plan-request" aria-labelledby="request-title">
        <h2 id="request-title" className="card-title">{plans.length ? 'Write a new plan' : 'Write your first plan'}</h2>
        <p className="card-subtitle">
          {summary.current.daysWithData === 0
            ? `You have no numbers in the last ${period} days yet. You can still generate a starter plan or add custom steps below.`
            : 'Three to five steps you can finish this week, each tied to your numbers.'}
        </p>
        <div className="plan-request-controls">
          <div className="field">
            <span className="field-label" id="plan-period-label">Based on</span>
            <div className="segmented" role="group" aria-labelledby="plan-period-label">
              {PERIODS.map((p) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} disabled={Boolean(pending)}>Last {p} days</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="plan-focus">Focus</label>
            <select id="plan-focus" className="input-field" value={focus ?? ''} onChange={(e) => setFocus(e.target.value || null)} disabled={Boolean(pending)}>
              {PLAN_FOCUSES.map((f) => <option key={f.label} value={f.value ?? ''}>{f.label}</option>)}
            </select>
          </div>
        </div>
        <ContextPreview profile={profile} summary={summary} campaigns={campaignCount} period={period} />
        <div className="page-actions" style={{ marginTop: 14 }}>
          {pending?.kind === 'plan' ? (
            <>
              <button type="button" className="btn btn-primary" disabled aria-busy="true"><span className="spinner spinner--light" /> Writing your plan ({pending.who})… <Elapsed since={pending.since} /></button>
              <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>Cancel</button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`btn ${plans.length && (suggested.length || (active.length && !allDone)) ? 'btn-secondary' : 'btn-primary'}`}
                onClick={generate}
                disabled={Boolean(pending) || outOfRequests}
              >
                {plans.length ? `Write a new plan (${importedAi ? importedAi.label : 'Claude'})` : 'Write my plan'}
              </button>
              {!importedAi && requestsLeft !== null && (
                <span className="field-help">{outOfRequests ? 'Used all 30 cloud requests today.' : `${requestsLeft} of ${DAILY_LIMIT} cloud requests left today`}</span>
              )}
            </>
          )}
        </div>
        {genError && (
          <div style={{ marginTop: 14 }}>
            {genError.notConfigured ? (
              <Notice tone="warning" title="VibeAssist Cloud Claude isn't configured">
                <Link to="/ai-models">Import your own Gemini, Claude, OpenAI, or local Ollama key</Link> to generate plans directly from your browser.
              </Notice>
            ) : (
              <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={generate}><RotateCcw aria-hidden="true" /> Try again</button>}>
                {genError.text}
              </Notice>
            )}
          </div>
        )}
      </section>

      <section className="card section" aria-labelledby="custom-step-title">
        <h2 id="custom-step-title" className="card-title">Add your own step</h2>
        <form className="inline-form" onSubmit={addCustomStep} style={{ marginTop: 8 }}>
          <label className="visually-hidden" htmlFor="custom-step-input">Custom step</label>
          <input
            id="custom-step-input"
            className="input-field"
            style={{ flex: 1 }}
            placeholder="E.g. Ship v1.4 paywall experiment to TestFlight"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
          />
          <select className="input-field input-sm" aria-label="Effort" value={customEffort} onChange={(e) => setCustomEffort(e.target.value)}>
            <option value="small">Under an hour</option>
            <option value="medium">A few hours</option>
            <option value="large">A day or more</option>
          </select>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!customTitle.trim()}><Plus aria-hidden="true" /> Add step</button>
        </form>
      </section>

      {plan && (
        <section className="section" aria-labelledby="plan-title">
          <div className="section-header">
            <div>
              <h2 id="plan-title">{isLatest ? 'This week' : 'Earlier plan'} · {planDate(plan.created_at)}</h2>
              <p className="field-help">
                Last {plan.period_days} days · {focusLabel(plan.focus)} · {plan.model}
                {plan.local ? ' · saved on this device' : ''}
                {plan.context?.includes_sample ? ' · used sample data' : ''}
              </p>
            </div>
            <div className="page-actions">
              <div className="segmented" role="group" aria-label="Filter by effort">
                <button type="button" aria-pressed={effortFilter === 'all'} onClick={() => setEffortFilter('all')}>All</button>
                <button type="button" aria-pressed={effortFilter === 'small'} onClick={() => setEffortFilter('small')}>Quick</button>
                <button type="button" aria-pressed={effortFilter === 'medium'} onClick={() => setEffortFilter('medium')}>Medium</button>
                <button type="button" aria-pressed={effortFilter === 'large'} onClick={() => setEffortFilter('large')}>Deep</button>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={copyPlan}><Copy aria-hidden="true" /> Copy</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(`weekly-plan-${plan.created_at.slice(0, 10)}.md`, planAsText(plan), 'text/markdown;charset=utf-8')}>
                <FileDown aria-hidden="true" /> .md
              </button>
              {confirmDelete ? (
                <span className="inline-confirm" role="group" aria-label="Confirm delete">
                  Delete this plan?
                  <button type="button" className="btn btn-danger btn-sm" onClick={deletePlan}>Delete</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" /> Delete</button>
              )}
            </div>
          </div>

          <div className="card plan-card">
            <p className="plan-summary">{plan.summary}</p>
            {plan.missing_data?.length > 0 && (
              <p className="field-help" style={{ marginTop: 8 }}>Would make the next plan better: {plan.missing_data.join('; ')}.</p>
            )}

            {suggested.length > 0 && (
              <>
                <div className="section-header plan-group-header">
                  <h3>Suggested · {suggested.length} to review</h3>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={keepAll}>Keep all</button>
                </div>
                <ol className="plan-steps">
                  {suggested.map((step) => <Step key={step.id} step={step} onStatus={setStatus} />)}
                </ol>
              </>
            )}

            {active.length > 0 && (
              <>
                <div className="section-header plan-group-header">
                  <h3>Your steps · {active.filter((s) => s.status === 'done').length} of {active.length} done</h3>
                </div>
                <ol className="plan-steps">
                  {active.map((step) => (
                    <React.Fragment key={step.id}>
                      <Step step={step} onStatus={setStatus} />
                      <li className="plan-step-ask">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => askAboutStep(step)}><MessageSquare aria-hidden="true" /> Ask about this step</button>
                      </li>
                    </React.Fragment>
                  ))}
                </ol>
              </>
            )}

            {allDone && (
              <Notice tone="success" title="Every step is done">
                Add this week&apos;s numbers on Overall Income, then write next week&apos;s plan.
              </Notice>
            )}

            {dismissed.length > 0 && (
              <details className="plan-dismissed">
                <summary>Dismissed · {dismissed.length}</summary>
                <ul>
                  {dismissed.map((step) => (
                    <li key={step.id}>
                      <span>{step.title}</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(step, 'suggested')}>Restore</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="ask-title">
        <div className="section-header"><h2 id="ask-title">Ask about your numbers</h2></div>
        <div className="card">
          {answers.length > 0 && (
            <ol className="qa-list">
              {answers.map((a) => (
                <li key={a.at}>
                  <p className="qa-question">{a.question}</p>
                  <p className="qa-answer">{a.answer}</p>
                  <p className="field-help">Answer by {a.model || 'Claude'}</p>
                </li>
              ))}
            </ol>
          )}
          <form onSubmit={ask}>
            <label className="field-label" htmlFor="ask-input">Question</label>
            <textarea
              id="ask-input"
              ref={askBox}
              className="input-field"
              rows={3}
              maxLength={4000}
              placeholder="For example: Which campaign should I pause first?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(e);
              }}
              disabled={pending?.kind === 'ask'}
            />
            {askError && <p className="field-error" role="alert" style={{ marginTop: 6 }}>{askError}</p>}
            <div className="page-actions" style={{ marginTop: 10 }}>
              {pending?.kind === 'ask' ? (
                <>
                  <button type="button" className="btn btn-secondary" disabled aria-busy="true"><span className="spinner" /> Waiting… <Elapsed since={pending.since} /></button>
                  <button type="button" className="btn btn-ghost" onClick={() => abort.current?.abort()}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="submit" className="btn btn-secondary" disabled={!question.trim() || Boolean(pending) || outOfRequests}>Ask</button>
                  <span className="field-help">Ctrl + Enter to send. Uses {importedAi ? importedAi.label : 'Claude'}.</span>
                  {answers.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnswers([])}>Clear answers</button>}
                </>
              )}
            </div>
          </form>
        </div>
      </section>

      {plans.length > 1 && (
        <section className="section" aria-labelledby="history-title">
          <div className="section-header"><h2 id="history-title">History</h2></div>
          <div className="card card--flush">
            <ul className="plan-history">
              {plans.map((p) => {
                const kept = p.plan_steps.filter((s) => s.status === 'kept' || s.status === 'done');
                return (
                  <li key={p.id}>
                    <button type="button" aria-current={p.id === plan?.id ? 'true' : undefined} onClick={() => { setSelectedId(p.id); window.scrollTo({ top: 0 }); }}>
                      <span><strong>{formatDay(p.created_at.slice(0, 10), true)}</strong> · last {p.period_days} days · {focusLabel(p.focus)}</span>
                      <span className="field-help">{kept.length ? `${kept.filter((s) => s.status === 'done').length} of ${kept.length} done` : `${p.plan_steps.length} suggested`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
