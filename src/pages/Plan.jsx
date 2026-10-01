import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, MessageSquare, RotateCcw, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { fetchMetrics, formatDay, SOURCE_LABELS, summarize } from '../lib/metrics';
import { formatCount, formatMoney } from '../lib/format';
import { usePersistentState } from '../lib/usePersistentState';
import { experienceLabel, PERIODS, PLAN_FOCUSES, profitLabel } from '../lib/options';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';

const DAILY_LIMIT = 30;
const EFFORT_LABELS = { small: 'Under an hour', medium: 'A few hours', large: 'A day or more' };
const PLAN_SELECT = 'id, created_at, period_days, focus, summary, missing_data, context, model, plan_steps(id, position, title, detail, based_on, effort, status)';

const focusLabel = (value) => PLAN_FOCUSES.find((f) => f.value === (value ?? null))?.label ?? 'Whatever matters most';
const planDate = (iso) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
const sortSteps = (plan) => ({ ...plan, plan_steps: [...(plan.plan_steps ?? [])].sort((a, b) => a.position - b.position) });

function planAsText(plan) {
  const kept = plan.plan_steps.filter((s) => s.status === 'kept' || s.status === 'done');
  const steps = kept.length ? kept : plan.plan_steps.filter((s) => s.status !== 'dismissed');
  return [
    `Plan from ${planDate(plan.created_at)} (based on the last ${plan.period_days} days)`,
    plan.summary,
    '',
    ...steps.map((s, i) => `${i + 1}. ${s.status === 'done' ? '[done] ' : ''}${s.title}\n   ${s.detail}`),
    '',
    `Written by Claude (${plan.model}) in VibeAssist.`,
  ].join('\n');
}

function Elapsed({ since }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span>{Math.max(0, Math.round((now - since) / 1000))}s</span>;
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
          <span className="badge">{EFFORT_LABELS[step.effort]}</span>
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

function ContextPreview({ profile, summary, campaigns, period }) {
  const { current, sources } = summary;
  const currency = profile?.currency ?? 'USD';
  return (
    <details className="context-preview">
      <summary>What Claude will see</summary>
      <dl>
        <div><dt>Numbers</dt><dd>
          Last {period} days and the {period} before. This period: {formatMoney(current.revenue, currency)} revenue, {formatCount(current.downloads)} downloads,
          {' '}{formatMoney(current.adSpend, currency)} ad spend ({current.daysWithData} days with data).
        </dd></div>
        <div><dt>Sources</dt><dd>{sources.length ? sources.map((s) => SOURCE_LABELS[s] ?? s).join(', ') : 'none yet'}</dd></div>
        <div><dt>Campaigns</dt><dd>{campaigns} tracked</dd></div>
        <div><dt>About you</dt><dd>
          {experienceLabel(profile?.experience)}; target {profitLabel(profile?.profit_expectancy)};
          {' '}goals: {profile?.goals?.length ? profile.goals.join(', ') : 'none set'}. <Link to="/settings">Edit</Link>
        </dd></div>
      </dl>
      <p className="field-help">
        Sent to Anthropic's Claude only when you ask for a plan or ask a question. Your email and Stripe keys are never included.
      </p>
    </details>
  );
}

export default function Plan() {
  const { profile } = useAuth();
  const toast = useToast();
  const [period, setPeriod] = usePersistentState('plan-period', 30);
  const [focus, setFocus] = usePersistentState('plan-focus', null);
  const [plans, setPlans] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [campaignCount, setCampaignCount] = useState(0);
  const [requestsLeft, setRequestsLeft] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState(null); // { kind: 'plan' | 'ask', since }
  const [genError, setGenError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [question, setQuestion] = usePersistentState('plan-question-draft', '');
  const [answers, setAnswers] = usePersistentState('plan-answers', []);
  const [askError, setAskError] = useState('');
  const abort = useRef(null);
  const askBox = useRef(null);

  const load = useCallback(async () => {
    const [plansRes, metricsRes, campaignsRes, usageRes] = await Promise.all([
      supabase.from('advisor_plans').select(PLAN_SELECT).order('created_at', { ascending: false }).limit(12),
      fetchMetrics(period * 2),
      supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }),
      supabase.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 864e5).toISOString()),
    ]);
    if (plansRes.error) {
      setLoadError(friendlyError(plansRes.error, 'Could not load your plans.'));
      setPlans((p) => p ?? []);
      return;
    }
    setLoadError('');
    setPlans(plansRes.data.map(sortSteps));
    setMetrics(metricsRes.data ?? []);
    setCampaignCount(campaignsRes.count ?? 0);
    setRequestsLeft(Math.max(0, DAILY_LIMIT - (usageRes.count ?? 0)));
  }, [period]);

  useEffect(() => {
    load();
    return () => abort.current?.abort();
  }, [load]);

  const summary = useMemo(() => summarize(metrics, period), [metrics, period]);
  const plan = plans?.find((p) => p.id === selectedId) ?? plans?.[0] ?? null;
  const isLatest = plan && plans?.[0]?.id === plan.id;
  const suggested = plan?.plan_steps.filter((s) => s.status === 'suggested') ?? [];
  const active = plan?.plan_steps.filter((s) => s.status === 'kept' || s.status === 'done') ?? [];
  const dismissed = plan?.plan_steps.filter((s) => s.status === 'dismissed') ?? [];
  const allDone = active.length > 0 && suggested.length === 0 && active.every((s) => s.status === 'done');

  const replaceStep = (planId, stepId, status) =>
    setPlans((list) => list.map((p) => (p.id !== planId ? p : { ...p, plan_steps: p.plan_steps.map((s) => (s.id === stepId ? { ...s, status } : s)) })));

  // Optimistic: the change shows immediately and is rolled back if saving fails
  const setStatus = async (step, status, { silent = false } = {}) => {
    const planId = plan.id;
    const before = step.status;
    replaceStep(planId, step.id, status);
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

  const generate = async () => {
    if (pending) return;
    const controller = new AbortController();
    abort.current = controller;
    setGenError(null);
    setPending({ kind: 'plan', since: Date.now() });
    const { data, status, aborted } = await callFunction('ai-advisor', { mode: 'plan', period_days: period, focus }, { signal: controller.signal });
    setPending(null);
    if (aborted) {
      toast.show({ message: 'Stopped waiting. If Claude finishes anyway, the plan will appear in your history.' });
      setTimeout(load, 60_000);
      return;
    }
    if (status !== 200) {
      setGenError(data?.error === 'not_configured' ? { notConfigured: true } : { text: data?.error ?? 'The plan could not be written. Nothing was saved. Try again.' });
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
    setPending({ kind: 'ask', since: Date.now() });
    const history = answers.flatMap((a) => [{ role: 'user', content: a.question }, { role: 'assistant', content: a.answer }]);
    const { data, status, aborted } = await callFunction(
      'ai-advisor',
      { mode: 'ask', period_days: period, plan_id: plan?.id, messages: [...history, { role: 'user', content: text }] },
      { signal: controller.signal },
    );
    setPending(null);
    if (aborted) return; // the question stays in the box
    if (status !== 200) {
      setAskError(data?.error === 'not_configured' ? 'The advisor is not set up yet (see the note above). Your question is still in the box.' : `${data?.error ?? 'No answer this time.'} Your question is still in the box.`);
      return;
    }
    setAnswers([...answers, { question: text, answer: data.reply, at: new Date().toISOString() }]);
    setQuestion('');
    load();
  };

  const copyPlan = async () => {
    try {
      await navigator.clipboard.writeText(planAsText(plan));
      toast.show({ message: 'Plan copied as plain text.' });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser. Select the text and copy it instead.', tone: 'error' });
    }
  };

  const deletePlan = async () => {
    const { error } = await supabase.from('advisor_plans').delete().eq('id', plan.id);
    setConfirmDelete(false);
    if (error) {
      toast.show({ message: friendlyError(error, 'Could not delete the plan. Try again.'), tone: 'error' });
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
        <PageHeader title="Plan" description="A weekly plan written by Claude from your numbers. Keep the steps that make sense and tick them off." />
        <div className="skeleton" style={{ height: 180 }} aria-busy="true" aria-label="Loading your plans" />
      </>
    );
  }

  const outOfRequests = requestsLeft === 0;

  return (
    <>
      <PageHeader title="Plan" description="A weekly plan written by Claude from your numbers. Keep the steps that make sense and tick them off." />

      {loadError && (
        <div className="section"><Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice></div>
      )}

      <section className="card plan-request" aria-labelledby="request-title">
        <h2 id="request-title" className="card-title">{plans.length ? 'Write a new plan' : 'Write your first plan'}</h2>
        <p className="card-subtitle">
          {plans.length
            ? 'Your current plan stays in history. A new one starts from your latest numbers.'
            : summary.current.daysWithData === 0
              ? `You have no numbers in the last ${period} days yet. Claude can still suggest how to start, but the plan is better with data.`
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
              <button type="button" className="btn btn-primary" disabled aria-busy="true"><span className="spinner spinner--light" /> Writing your plan… <Elapsed since={pending.since} /></button>
              <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>Cancel</button>
              <span className="field-help">Usually 20 to 60 seconds.</span>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`btn ${plans.length && (suggested.length || (active.length && !allDone)) ? 'btn-secondary' : 'btn-primary'}`}
                onClick={generate}
                disabled={Boolean(pending) || outOfRequests}
              >
                {plans.length ? 'Write a new plan' : 'Write my plan'}
              </button>
              {requestsLeft !== null && (
                <span className="field-help">{outOfRequests ? 'You have used all 30 advisor requests for today.' : `${requestsLeft} of ${DAILY_LIMIT} advisor requests left today`}</span>
              )}
            </>
          )}
        </div>
        {genError && (
          <div style={{ marginTop: 14 }}>
            {genError.notConfigured ? (
              <Notice tone="warning" title="The advisor isn't set up for this app yet">
                The <code>ANTHROPIC_API_KEY</code> secret is missing in Supabase (Edge Functions → Secrets). Nothing was sent to Claude and nothing was saved.
              </Notice>
            ) : (
              <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={generate}><RotateCcw aria-hidden="true" /> Try again</button>}>
                {genError.text}
              </Notice>
            )}
          </div>
        )}
      </section>

      {plan && (
        <section className="section" aria-labelledby="plan-title">
          <div className="section-header">
            <div>
              <h2 id="plan-title">{isLatest ? 'This week' : 'Earlier plan'} · {planDate(plan.created_at)}</h2>
              <p className="field-help">
                Last {plan.period_days} days · {focusLabel(plan.focus)} · written by Claude ({plan.model})
                {plan.context?.includes_sample ? ' · used sample data' : ''}
              </p>
            </div>
            <div className="page-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={copyPlan}><Copy aria-hidden="true" /> Copy</button>
              {confirmDelete ? (
                <span className="inline-confirm" role="group" aria-label="Confirm delete">
                  Delete this plan for good?
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
                Add this week's numbers on the Overview, then write next week's plan.
              </Notice>
            )}

            {dismissed.length > 0 && (
              <details className="plan-dismissed">
                <summary>Dismissed · {dismissed.length}</summary>
                <ul>
                  {dismissed.map((step) => (
                    <li key={step.id}>
                      <span>{step.title}</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(step, 'suggested')}>Restore<span className="visually-hidden">: {step.title}</span></button>
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
                  <p className="field-help">Answer by Claude</p>
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
                  <button type="button" className="btn btn-secondary" disabled aria-busy="true"><span className="spinner" /> Waiting for an answer… <Elapsed since={pending.since} /></button>
                  <button type="button" className="btn btn-ghost" onClick={() => abort.current?.abort()}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="submit" className="btn btn-secondary" disabled={!question.trim() || Boolean(pending) || outOfRequests}>Ask</button>
                  <span className="field-help">Ctrl + Enter to send. Uses the same numbers{plan ? ' and this plan' : ''} as context.</span>
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
