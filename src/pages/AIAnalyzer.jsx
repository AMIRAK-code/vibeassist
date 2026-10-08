import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, RotateCcw, Send } from 'lucide-react';
import { useAuth } from '../context/auth';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { fetchMetrics, formatDay, summarize } from '../lib/metrics';
import { formatCount, formatMoney } from '../lib/format';
import { priceSignal, unitEconomics } from '../lib/unitEconomics';
import { usePersistentState } from '../lib/usePersistentState';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';
import Elapsed from '../components/ui/Elapsed';
import ContextPreview from '../components/ContextPreview';

const PERIOD = 90; // the analyzer always looks at the last 90 days
const DAILY_LIMIT = 30; // shared with Weekly Plan
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
  const { profile } = useAuth();
  const currency = profile?.currency ?? 'USD';
  const money = (v) => (v === null ? null : formatMoney(v, currency));
  const [rows, setRows] = useState(null);
  const [campaignCount, setCampaignCount] = useState(0);
  const [requestsLeft, setRequestsLeft] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [churn, setChurn] = usePersistentState('analyzer-churn', '');
  const [chat, setChat] = usePersistentState('analyzer-chat', []); // [{ role, content, at }]
  const [draft, setDraft] = usePersistentState('analyzer-draft', '');
  const [pending, setPending] = useState(null); // { since } while Claude is answering
  const [chatError, setChatError] = useState(null); // { text } or { notConfigured: true }
  const abort = useRef(null);
  const inputRef = useRef(null);
  const logEnd = useRef(null);

  const load = useCallback(async () => {
    const [metrics, campaigns, usage] = await Promise.all([
      fetchMetrics(PERIOD * 2),
      supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }),
      supabase.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 864e5).toISOString()),
    ]);
    if (metrics.error) {
      setLoadError(friendlyError(metrics.error, 'Could not load your numbers.'));
      setRows((previous) => previous ?? []);
      return;
    }
    setLoadError('');
    setRows(metrics.data);
    setCampaignCount(campaigns.count ?? 0);
    setRequestsLeft(Math.max(0, DAILY_LIMIT - (usage.count ?? 0)));
  }, []);

  useEffect(() => {
    load();
    return () => abort.current?.abort();
  }, [load]);

  // Keep the newest message in view
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [chat.length, pending]);

  const summary = useMemo(() => summarize(rows ?? [], PERIOD), [rows]);
  const { current } = summary;
  const profit = current.revenue - current.fees - current.adSpend;
  const economics = useMemo(() => unitEconomics(summary.chartData, PERIOD, churn === '' ? null : churn), [summary, churn]);
  const pricing = useMemo(() => priceSignal(summary.chartData), [summary]);
  const latestPrice = [...pricing.weeks].reverse().find((w) => w.price !== null)?.price ?? null;
  const outOfRequests = requestsLeft === 0;
  const firstName = profile?.name?.split(' ')[0];

  const prefill = (text) => {
    setDraft(text);
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: 'center' });
  };

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
    setPending({ since: Date.now() });
    const { data, status, aborted } = await callFunction(
      'ai-advisor',
      { mode: 'ask', period_days: PERIOD, messages: history.map(({ role, content }) => ({ role, content })) },
      { signal: controller.signal },
    );
    setPending(null);
    if (aborted || status !== 200) {
      // Nothing was answered: take the question back out of the log and put it back in the box
      setChat(before);
      setDraft(question);
      if (!aborted) {
        setChatError(data?.error === 'not_configured' ? { notConfigured: true } : { text: data?.error ?? 'No answer this time.' });
      }
      return;
    }
    setChat([...history, { role: 'assistant', content: data.reply, at: new Date().toISOString() }]);
    setRequestsLeft((n) => (n === null ? n : Math.max(0, n - 1)));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    send(draft);
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
        description="Growth and pricing figures worked out from your last 90 days, and a chat with Claude about them."
      />

      {loadError && (
        <div className="section">
          <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice>
        </div>
      )}
      {summary.sources.includes('sample') && (
        <div className="section">
          <Notice tone="warning">Sample data is mixed into these numbers, so the figures below don't describe your real business.</Notice>
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
          <ContextPreview profile={profile} summary={summary} campaigns={campaignCount} period={PERIOD} />
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
            <p className="field-help" id="churn-help">Share of paying users who leave each month. Used only for LTV; it's your assumption, not measured.</p>
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
                  ? 'Purchases moved the same way as price, so something else (a launch, ads, the season) probably drove them. Treat this as noise.'
                  : Math.abs(pricing.change.elasticity) < 1
                    ? 'Purchases changed less than price did: buyers looked price-insensitive, so a higher price brought in more revenue.'
                    : 'Purchases changed more than price did: buyers looked price-sensitive, so a higher price brought in less revenue.'}
                {' '}Only a rough signal: other things changed in those weeks too.
              </p>
            </>
          ) : latestPrice !== null ? (
            <p className="analyzer-text">
              Revenue per purchase stayed within 10% from week to week (latest {money(latestPrice)}), so your data has no price change to measure.
              To learn how buyers react, try a price test: raise the price for new customers by about 20% for two weeks, then compare purchases.
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

      <section className="card section" aria-labelledby="chat-title">
        <div className="section-header">
          <h2 id="chat-title" className="card-title">Chat with your numbers</h2>
          <div className="page-actions">
            {requestsLeft !== null && (
              <span className="field-help">{outOfRequests ? `You've used all ${DAILY_LIMIT} requests for today.` : `${requestsLeft} of ${DAILY_LIMIT} requests left today`}</span>
            )}
            {chat.length > 0 && !pending && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setChat([]); setChatError(null); }}>New chat</button>
            )}
          </div>
        </div>

        <div className="chat-log" role="log" aria-live="polite" aria-label="Conversation">
          <div className="chat-msg chat-msg--assistant">
            <p className="chat-who">VibeAssist</p>
            <p>
              {firstName ? `Hi ${firstName}. ` : 'Hi. '}
              Claude can see your last 90 days of numbers{profile?.goals?.length ? ` and your goals (${profile.goals.join(', ').toLowerCase()})` : ''}.
              Ask about pricing, ads, growth or anything in your data.
            </p>
          </div>
          {chat.map((m) => (
            <div key={m.at + m.role} className={`chat-msg chat-msg--${m.role}`}>
              <p className="chat-who">{m.role === 'user' ? 'You' : 'Claude'}</p>
              <p className="chat-text">{m.content}</p>
            </div>
          ))}
          {pending && (
            <div className="chat-msg chat-msg--assistant chat-msg--pending">
              <p className="chat-who">Claude</p>
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
              <Notice tone="warning" title="The analyzer isn't set up for this app yet">
                The <code>ANTHROPIC_API_KEY</code> secret is missing in Supabase (Edge Functions → Secrets). Nothing was sent to Claude. Your question is still in the box.
              </Notice>
            ) : (
              <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => send(draft)}><RotateCcw aria-hidden="true" /> Try again</button>}>
                {chatError.text} Your question is still in the box.
              </Notice>
            )}
          </div>
        )}

        <form className="chat-form" onSubmit={onSubmit}>
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
        <p className="field-help" style={{ marginTop: 6 }}>Enter to send, Shift + Enter for a new line. Answers are written by Claude from your data and can be wrong.</p>
      </section>
    </>
  );
}
