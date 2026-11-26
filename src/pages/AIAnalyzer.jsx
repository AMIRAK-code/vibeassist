import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, FileDown, MessageSquare, RotateCcw, Send, Sliders } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { fetchMetrics, formatDay, summarize } from '../lib/metrics';
import { formatCount, formatMoney, formatMoneyExact } from '../lib/format';
import { priceSignal, unitEconomics } from '../lib/unitEconomics';
import { usePersistentState } from '../lib/usePersistentState';
import { download } from '../lib/download';
import { completeWithUserAi, useImportedAi } from '../lib/aiClient';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';
import Elapsed from '../components/ui/Elapsed';
import ContextPreview from '../components/ContextPreview';
import ModelSelectorPill from '../components/ModelSelectorPill';

const PERIOD = 90;
const DAILY_LIMIT = 30;
const STARTERS = [
  'How did my last 90 days go, and what should I focus on next?',
  'Which ad campaign should I pause first?',
  'Am I spending too much on ads for what they bring in?',
];

function Figure({ label, value, hint }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? '—'}{hint && <span className="field-help"> {hint}</span>}</dd>
    </div>
  );
}

export default function AIAnalyzer() {
  const { profile, hasPremium } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { active: importedAi } = useImportedAi('analyzer');

  const currency = profile?.currency ?? 'USD';
  const money = (v) => (v === null ? null : Math.abs(v) < 100 ? formatMoneyExact(v, currency) : formatMoney(v, currency));
  const [rows, setRows] = useState(null);
  const [campaignRows, setCampaignRows] = useState([]);
  const [requestsLeft, setRequestsLeft] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [churn, setChurn] = usePersistentState('analyzer-churn', '');
  const [chat, setChat] = usePersistentState('analyzer-chat', []);
  const [draft, setDraft] = usePersistentState('analyzer-draft', '');
  const [pending, setPending] = useState(null);
  const [chatError, setChatError] = useState(null);

  // What-If Simulator levers
  const [simPricePct, setSimPricePct] = useState(0);
  const [simConvPct, setSimConvPct] = useState(0);
  const [simAdPct, setSimAdPct] = useState(0);

  const abort = useRef(null);
  const inputRef = useRef(null);
  const logEnd = useRef(null);

  const load = useCallback(async () => {
    const [metrics, campaigns, usage] = await Promise.all([
      fetchMetrics(PERIOD * 2),
      supabase.from('ad_campaigns').select('name, network, status, spend, revenue, installs').limit(40),
      supabase.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 864e5).toISOString()),
    ]);
    if (metrics.error) {
      setLoadError(friendlyError(metrics.error, 'Could not load your numbers.'));
      setRows((previous) => previous ?? []);
      return;
    }
    setLoadError('');
    setRows(metrics.data);
    setCampaignRows(campaigns.data ?? []);
    setRequestsLeft(Math.max(0, DAILY_LIMIT - (usage.count ?? 0)));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 0);
    return () => {
      clearTimeout(t);
      abort.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const initialPrompt = params.get('prompt');
    if (!initialPrompt) return;
    const t = setTimeout(() => {
      setDraft(initialPrompt);
      setParams({}, { replace: true });
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [params, setDraft, setParams]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [chat.length, pending]);

  const summary = useMemo(() => summarize(rows ?? [], PERIOD), [rows]);
  const { current, previous } = summary;
  const profit = current.revenue - current.fees - current.adSpend;
  const economics = useMemo(() => unitEconomics(summary.chartData, PERIOD, churn === '' ? null : churn), [summary, churn]);
  const pricing = useMemo(() => priceSignal(summary.chartData), [summary]);
  const latestPrice = [...pricing.weeks].reverse().find((w) => w.price !== null)?.price ?? null;
  const outOfRequests = !importedAi && requestsLeft === 0;
  const firstName = profile?.name?.split(' ')[0];

  // What-If calculation
  const sim = useMemo(() => {
    const priceMult = 1 + simPricePct / 100;
    const convMult = 1 + simConvPct / 100;
    const adMult = 1 + simAdPct / 100;
    const feeRate = current.revenue > 0 ? current.fees / current.revenue : 0.03;
    const baseRev = current.revenue;
    const simRevenue = baseRev * priceMult * convMult;
    const simFees = simRevenue * feeRate;
    const simAds = current.adSpend * adMult;
    const simProfit = simRevenue - simFees - simAds;
    return { simRevenue, simProfit, simAds, deltaProfit: simProfit - profit };
  }, [current, profit, simPricePct, simConvPct, simAdPct]);

  const prefill = (text) => {
    setDraft(text);
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: 'center' });
  };

  const buildLocalContext = () => [
    `Period: last ${PERIOD} days (${currency}).`,
    `Current period: revenue ${current.revenue.toFixed(2)}, fees ${current.fees.toFixed(2)}, ad spend ${current.adSpend.toFixed(2)}, net profit ${profit.toFixed(2)}, downloads ${current.downloads}, purchases ${current.purchases}, days with data ${current.daysWithData}.`,
    `Previous ${PERIOD} days: revenue ${previous.revenue.toFixed(2)}, ad spend ${previous.adSpend.toFixed(2)}, downloads ${previous.downloads}, purchases ${previous.purchases}.`,
    `Unit economics: CAC ${economics.cac?.toFixed(2) ?? 'N/A'}, ARPU/mo ${economics.arpuMonthly?.toFixed(2) ?? 'N/A'}, LTV ${economics.ltv?.toFixed(2) ?? 'N/A'}, LTV:CAC ${economics.ltvToCac?.toFixed(2) ?? 'N/A'}.`,
    `Profile goals: ${profile?.goals?.join('; ') || 'none set'}. Experience: ${profile?.experience ?? 'Beginner'}. Target: ${profile?.profit_expectancy ?? 'N/A'}.`,
    `Includes sample data: ${summary.sources.includes('sample') ? 'yes' : 'no'}.`,
    campaignRows.length
      ? `Campaigns:\n${campaignRows.slice(0, 20).map((c) => `- ${c.name} (${c.network}, ${c.status}): spend ${c.spend}, rev ${c.revenue}, installs ${c.installs}`).join('\n')}`
      : 'No ad campaigns tracked yet.',
  ].join('\n');

  const send = async (text) => {
    const question = text.trim();
    if (!question || pending || outOfRequests) return;
    const before = chat;
    const history = [...chat, { role: 'user', content: question, at: new Date().toISOString() }];
    const controller = new AbortController();
    abort.current = controller;
    setChat(history);
    setDraft('');
    setChatError(null);
    setPending({ since: Date.now(), who: importedAi ? importedAi.label : 'Claude' });

    if (importedAi) {
      try {
        const res = await completeWithUserAi({
          connection: importedAi,
          system: [
            'You are a concise, data-grounded indie app business analyst inside VibeAssist.',
            'Base every figure strictly on the user metrics below; state assumptions clearly if estimating. Keep answers under 220 words unless asked for detail.',
            buildLocalContext(),
          ],
          messages: history.map(({ role, content }) => ({ role, content })),
          maxTokens: 900,
          signal: controller.signal,
        });
        setPending(null);
        setChat([...history, { role: 'assistant', who: `${importedAi.label} (${res.model})`, content: res.text, at: new Date().toISOString() }]);
      } catch (err) {
        setPending(null);
        setChat(before);
        setDraft(question);
        if (err?.name !== 'AbortError') setChatError({ text: err?.message || 'AI request failed.' });
      }
      return;
    }

    const { data, status, aborted } = await callFunction(
      'ai-advisor',
      { mode: 'ask', period_days: PERIOD, messages: history.map(({ role, content }) => ({ role, content })) },
      { signal: controller.signal },
    );
    setPending(null);
    if (aborted || status !== 200) {
      setChat(before);
      setDraft(question);
      if (!aborted) {
        setChatError(data?.error === 'not_configured' ? { notConfigured: true } : { text: data?.error ?? 'No answer this time.' });
      }
      return;
    }
    setChat([...history, { role: 'assistant', who: 'Claude', content: data.reply, at: new Date().toISOString() }]);
    setRequestsLeft((n) => (n === null ? n : Math.max(0, n - 1)));
  };

  const exportChat = () => {
    const md = [
      '# VibeAssist Business Analyzer Chat',
      '',
      ...chat.flatMap((m) => [`### ${m.role === 'user' ? 'You' : (m.who || 'AI')}`, m.content, '']),
    ].join('\n');
    download('vibeassist-analyzer-chat.md', md, 'text/markdown;charset=utf-8');
  };

  if (rows === null) {
    return (
      <>
        <PageHeader title="AI Business & Profit Analyzer" />
        <div className="grid-3" aria-busy="true" aria-label="Loading your numbers">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AI Business & Profit Analyzer"
        description="Unit economics, pricing elasticity, an interactive What-If simulator, and Q&A powered by your chosen AI."
      />

      {loadError && (
        <div className="section">
          <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice>
        </div>
      )}
      {summary.sources.includes('sample') && (
        <div className="section">
          <Notice tone="warning">Sample data is mixed into these numbers, so the figures below don&apos;t describe your real business.</Notice>
        </div>
      )}

      <div className="grid-3 analyzer-cards">
        <section className="card" aria-labelledby="numbers-title">
          <h2 id="numbers-title" className="card-title">Your Real Numbers</h2>
          <p className="card-subtitle">Last 90 days of metrics</p>
          <dl className="figure-list">
            <Figure label="Revenue" value={money(current.revenue)} />
            <Figure label="Profit after fees and ads" value={money(profit)} />
            <Figure label="Downloads" value={formatCount(current.downloads)} />
            <Figure label="Days with data" value={`${current.daysWithData} of ${PERIOD}`} />
          </dl>
          <ContextPreview profile={profile} summary={summary} campaigns={campaignRows.length} period={PERIOD} />
          <button type="button" className="btn btn-secondary btn-sm analyzer-ask" onClick={() => prefill(STARTERS[0])}>
            <MessageSquare aria-hidden="true" /> Ask about my numbers
          </button>
        </section>

        <section className="card" aria-labelledby="growth-title">
          <h2 id="growth-title" className="card-title">Growth Engine</h2>
          <p className="card-subtitle">LTV / CAC, calculated from your numbers (no AI)</p>
          <dl className="figure-list">
            <Figure label="Cost per paid install (CAC)" value={money(economics.cac)} />
            <Figure label="Revenue per active user, per month" value={money(economics.arpuMonthly)} hint={economics.arpuMonthly !== null ? 'after payment fees' : undefined} />
            <Figure label="Payback" value={economics.paybackMonths === null ? null : `${economics.paybackMonths.toFixed(1)} months`} />
            <Figure label="Lifetime value (LTV)" value={money(economics.ltv)} />
            <Figure label="LTV : CAC" value={economics.ltvToCac === null ? null : `${economics.ltvToCac.toFixed(1)} : 1`} />
          </dl>
          <div className="field" style={{ marginTop: 10 }}>
            <label className="field-label" htmlFor="churn">Monthly churn, your estimate (%)</label>
            <input
              id="churn"
              className="input-field"
              type="number"
              inputMode="decimal"
              min="0.1"
              max="100"
              step="0.1"
              placeholder="For example 8"
              value={churn}
              onChange={(e) => setChurn(e.target.value)}
              aria-describedby="churn-help"
            />
            <p className="field-help" id="churn-help">Share of paying users who leave each month. Used only for LTV.</p>
          </div>
          {economics.missing.length > 0 && (
            <p className="field-help">To fill in the rest, add {economics.missing.join(', ')}.</p>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm analyzer-ask"
            onClick={() => prefill([
              economics.cac !== null ? `My cost per paid install is ${money(economics.cac)}` : 'I have no cost per install figure yet',
              economics.arpuMonthly !== null ? ` and I make ${money(economics.arpuMonthly)} per active user per month` : '',
              economics.ltv !== null ? `, so lifetime value is about ${money(economics.ltv)}` : '',
              '. How can I improve my LTV to CAC?',
            ].join(''))}
          >
            <MessageSquare aria-hidden="true" /> Ask about this
          </button>
        </section>

        <section className="card" aria-labelledby="pricing-title">
          <h2 id="pricing-title" className="card-title">Pricing Strategy</h2>
          <p className="card-subtitle">Elasticity analysis from revenue per purchase</p>
          {pricing.change ? (
            <>
              <p className="analyzer-text">
                Revenue per purchase moved from {money(pricing.change.before.price)} (week of {formatDay(pricing.change.before.start)})
                {' '}to {money(pricing.change.after.price)} (week of {formatDay(pricing.change.after.start)}). Purchases went from
                {' '}{formatCount(pricing.change.before.purchases)} to {formatCount(pricing.change.after.purchases)} that week.
              </p>
              <dl className="figure-list">
                <Figure label="Rough price elasticity" value={pricing.change.elasticity.toFixed(1)} />
              </dl>
              <p className="field-help">
                {pricing.change.elasticity >= 0
                  ? 'Purchases moved the same way as price, so something else probably drove them.'
                  : Math.abs(pricing.change.elasticity) < 1
                    ? 'Purchases changed less than price did: higher price brought in more revenue.'
                    : 'Purchases changed more than price did: buyers looked price-sensitive.'}
              </p>
            </>
          ) : latestPrice !== null ? (
            <p className="analyzer-text">
              Revenue per purchase stayed within 10% from week to week (latest {money(latestPrice)}). To test elasticity, try raising price by 20% for new users over two weeks.
            </p>
          ) : (
            <p className="analyzer-text">Add purchases to your days to see revenue per purchase and how it changes.</p>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm analyzer-ask"
            onClick={() => prefill(latestPrice !== null
              ? `Should I change my price? My revenue per purchase is about ${money(latestPrice)}.`
              : 'How should I price my app?')}
          >
            <MessageSquare aria-hidden="true" /> Ask about pricing
          </button>
        </section>
      </div>

      <section className="card section" aria-labelledby="sim-title">
        <div className="section-header">
          <div>
            <h2 id="sim-title" className="card-title"><Sliders className="inline-icon" aria-hidden="true" /> Interactive What-If Profit Simulator (90-Day Baseline)</h2>
            <p className="card-subtitle">Model how pricing, conversion, or ad budget changes move your 90-day net profit.</p>
          </div>
          {(simPricePct !== 0 || simConvPct !== 0 || simAdPct !== 0) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSimPricePct(0); setSimConvPct(0); setSimAdPct(0); }}>Reset</button>
          )}
        </div>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="field-label" htmlFor="sim-price">Price change: {simPricePct >= 0 ? `+${simPricePct}%` : `${simPricePct}%`}</label>
            <input id="sim-price" type="range" min="-50" max="100" step="5" value={simPricePct} onChange={(e) => setSimPricePct(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="sim-conv">Conversion lift: {simConvPct >= 0 ? `+${simConvPct}%` : `${simConvPct}%`}</label>
            <input id="sim-conv" type="range" min="-50" max="100" step="5" value={simConvPct} onChange={(e) => setSimConvPct(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="sim-ads">Ad spend change: {simAdPct >= 0 ? `+${simAdPct}%` : `${simAdPct}%`}</label>
            <input id="sim-ads" type="range" min="-50" max="200" step="5" value={simAdPct} onChange={(e) => setSimAdPct(Number(e.target.value))} />
          </div>
        </div>
        <div className="stat-grid" style={{ marginTop: 12 }}>
          <div className="card stat"><p className="stat-label">Simulated 90d Revenue</p><p className="stat-value">{formatMoney(sim.simRevenue, currency)}</p></div>
          <div className="card stat"><p className="stat-label">Simulated 90d Ad Spend</p><p className="stat-value">{formatMoney(sim.simAds, currency)}</p></div>
          <div className="card stat"><p className="stat-label">Simulated 90d Net Profit</p><p className="stat-value">{formatMoney(sim.simProfit, currency)}</p></div>
          <div className="card stat">
            <p className="stat-label">Profit Impact</p>
            <p className="stat-value" style={{ color: sim.deltaProfit >= 0 ? 'var(--app-success)' : 'var(--app-danger)' }}>
              {sim.deltaProfit >= 0 ? '+' : ''}{formatMoney(sim.deltaProfit, currency)}
            </p>
          </div>
        </div>
      </section>

      <section className="card section" aria-labelledby="chat-title">
        <div className="section-header">
          <h2 id="chat-title" className="card-title">Chat with your numbers</h2>
          <div className="page-actions">
            {!importedAi && requestsLeft !== null && (
              <span className="field-help">{outOfRequests ? `Used all ${DAILY_LIMIT} cloud requests today.` : `${requestsLeft} of ${DAILY_LIMIT} cloud requests left`}</span>
            )}
            {chat.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={exportChat}><FileDown aria-hidden="true" /> Export .md</button>
            )}
            {chat.length > 0 && !pending && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setChat([]); setChatError(null); }}>New chat</button>
            )}
          </div>
        </div>

        <div style={{ margin: '10px 0 12px' }}>
          <ModelSelectorPill feature="analyzer" hasPremium={hasPremium} />
        </div>

        <div className="chat-log" role="log" aria-live="polite" aria-label="Conversation">
          <div className="chat-msg chat-msg--assistant">
            <p className="chat-who">VibeAssist</p>
            <p>
              {firstName ? `Hi ${firstName}. ` : 'Hi. '}
              {importedAi ? `${importedAi.label} (${importedAi.defaultModel})` : 'Claude'} can see your last 90 days of numbers{profile?.goals?.length ? ` and your goals (${profile.goals.join(', ').toLowerCase()})` : ''}.
              Ask about pricing, ads, growth, or anything in your data.
            </p>
          </div>
          {chat.map((m) => (
            <div key={m.at + m.role} className={`chat-msg chat-msg--${m.role}`}>
              <div className="flex-between">
                <p className="chat-who">{m.role === 'user' ? 'You' : (m.who || 'AI')}</p>
                {m.role === 'assistant' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigator.clipboard.writeText(m.content).then(() => toast.show({ message: 'Reply copied.' })).catch(() => {})}
                    aria-label="Copy reply"
                  >
                    <Copy aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="chat-text">{m.content}</p>
            </div>
          ))}
          {pending && (
            <div className="chat-msg chat-msg--assistant chat-msg--pending">
              <p className="chat-who">{pending.who}</p>
              <p><span className="spinner" /> Looking at your numbers… <Elapsed since={pending.since} /></p>
            </div>
          )}
          <div ref={logEnd} />
        </div>

        {chat.length === 0 && !pending && (
          <div className="chat-starters">
            {STARTERS.map((s) => (
              <button key={s} type="button" className="btn btn-ghost btn-sm" onClick={() => prefill(s)}>{s}</button>
            ))}
          </div>
        )}

        {chatError && (
          <div style={{ marginTop: 12 }}>
            {chatError.notConfigured ? (
              <Notice tone="warning" title="VibeAssist Cloud Claude isn't configured on this deployment">
                <Link to="/ai-models">Import your own Gemini, Claude, OpenAI, or local Ollama model</Link> to chat with your numbers immediately.
              </Notice>
            ) : (
              <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => send(draft)}><RotateCcw aria-hidden="true" /> Try again</button>}>
                {chatError.text}
              </Notice>
            )}
          </div>
        )}

        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <label className="visually-hidden" htmlFor="chat-input">Message</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            className="input-field"
            rows={2}
            maxLength={4000}
            placeholder="E.g. Analyze my pricing model for a new developer tool…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
            disabled={Boolean(pending)}
          />
          {pending ? (
            <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>Cancel</button>
          ) : (
            <button type="submit" className="btn btn-primary btn-icon" disabled={!draft.trim() || outOfRequests} aria-label="Send">
              <Send aria-hidden="true" />
            </button>
          )}
        </form>
      </section>
    </>
  );
}
