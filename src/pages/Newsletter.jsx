import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, MailCheck, MessageSquare, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { usePersistentState } from '../lib/usePersistentState';
import { CONSENT_TEXT } from '../../supabase/functions/_shared/consent.js';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';

// "AI news" comes from VibeAssist's shared feed; the other tabs ask Hacker News's public
// search API (hn.algolia.com) directly, newest first
const TOPICS = [
  { id: 'ai', label: 'AI news', feed: 'ai_news' },
  { id: 'indie', label: 'Indie apps', params: { query: 'indie app', tags: 'story' } },
  { id: 'show', label: 'Show HN', params: { query: '', tags: 'show_hn' } },
  { id: 'appstore', label: 'App Store', params: { query: 'App Store', tags: 'story' } },
  { id: 'play', label: 'Google Play', params: { query: 'Google Play', tags: 'story' } },
  { id: 'stripe', label: 'Stripe', params: { query: 'Stripe', tags: 'story' } },
];
const SOURCES = [
  { id: 'all', label: 'All' },
  { id: 'hn', label: 'Hacker News' },
  { id: 'reddit', label: 'Reddit' },
];

const ago = (iso) => {
  const hours = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 36e5));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};
const domainOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// Hacker News search results in the same shape as the shared feed's items
const fromHnHit = (h) => {
  const discussion = `https://news.ycombinator.com/item?id=${h.objectID}`;
  return { id: `hn:${h.objectID}`, source: 'hn', community: 'Hacker News', title: h.title, url: h.url || discussion, comments_url: discussion, points: h.points ?? 0, comments: h.num_comments ?? 0, created_at: h.created_at };
};

function StoryList({ items, empty }) {
  if (!items.length) return <div className="card empty-state"><p>{empty}</p></div>;
  return (
    <ol className="card card--flush news-list">
      {items.map((s) => (
        <li key={s.id}>
          <a href={s.url} target="_blank" rel="noreferrer" className="news-title">
            {s.title} <ExternalLink aria-hidden="true" /><span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          <p className="field-help">
            {s.community}{domainOf(s.url) && s.url !== s.comments_url ? ` · ${domainOf(s.url)}` : ''} · {s.points} points · {ago(s.created_at)} ·{' '}
            <a href={s.comments_url} target="_blank" rel="noreferrer">
              <MessageSquare aria-hidden="true" className="inline-icon" /> {s.comments} {s.comments === 1 ? 'comment' : 'comments'}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </p>
        </li>
      ))}
    </ol>
  );
}

function useSharedFeed(feed) {
  const [state, setState] = useState({ items: null, sources: {}, error: '' });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, error: '' }));
    const { data, status } = await callFunction('community-feed', { feed });
    if (status !== 200) setState((s) => ({ items: s.items ?? [], sources: s.sources, error: data?.error ?? "Couldn't load this feed. Try again." }));
    else setState({ items: data.items, sources: data.sources ?? {}, error: '' });
  }, [feed]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

function SubscribeCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [row, setRow] = useState(undefined); // undefined while loading, null when never subscribed
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { text } or { notConfigured: true }
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const { data, error: readError } = await supabase.from('newsletter_subscribers').select('status, include_numbers, confirm_sent_at').maybeSingle();
    if (readError) setError({ text: friendlyError(readError, 'Could not check your subscription.') });
    setRow(data ?? null);
    if (data) setIncludeNumbers(data.include_numbers);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const subscribe = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote('');
    const { data, status } = await callFunction('newsletter', { action: 'subscribe', include_numbers: includeNumbers });
    setBusy(false);
    if (status !== 200) {
      setError(data?.error === 'not_configured' ? { notConfigured: true } : { text: data?.error ?? 'Could not subscribe. Try again.' });
      return;
    }
    if (data.wait) setNote('We sent one a few minutes ago. Check spam, or ask again in a few minutes.');
    await load();
  };

  const toggleNumbers = async (value) => {
    setIncludeNumbers(value);
    const { error: saveError } = await supabase.from('newsletter_subscribers').update({ include_numbers: value }).eq('user_id', user.id);
    if (saveError) {
      setIncludeNumbers(!value);
      toast.show({ message: friendlyError(saveError, 'Could not save that. Try again.'), tone: 'error' });
    } else {
      toast.show({ message: value ? 'Your numbers will be in the next issue.' : 'The next issue will leave your numbers out.' });
    }
  };

  const numbersBox = (onChange) => (
    <label className="check-row">
      <input type="checkbox" checked={includeNumbers} onChange={(e) => onChange(e.target.checked)} />
      <span>Include my own numbers for last week (revenue, profit and downloads, without sample data)</span>
    </label>
  );

  return (
    <section className="card subscribe-card" aria-labelledby="subscribe-title">
      <h2 id="subscribe-title" className="card-title">Subscribe to the Weekly Vibe</h2>
      <p className="card-subtitle">Every Monday: the week's top indie-dev threads and AI news, plus how your own week went.</p>

      {row === undefined ? (
        <div className="skeleton" style={{ height: 60, marginTop: 12 }} aria-busy="true" aria-label="Checking your subscription" />
      ) : row?.status === 'active' ? (
        <>
          <p className="subscribe-state"><MailCheck aria-hidden="true" /> You're subscribed at {user.email}.</p>
          {numbersBox(toggleNumbers)}
          <p className="field-help">Change or stop it any time in <Link to="/settings#newsletter">Settings</Link>, or from the link in every email.</p>
        </>
      ) : row?.status === 'pending' ? (
        <>
          <p className="subscribe-state">Check your inbox at {user.email} and press the button in the email to confirm.</p>
          {note && <p className="field-help">{note}</p>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={subscribe} disabled={busy} aria-busy={busy}>{busy ? 'Sending…' : 'Send the email again'}</button>
        </>
      ) : (
        <>
          {numbersBox(setIncludeNumbers)}
          <p className="field-help">{CONSENT_TEXT}</p>
          <div className="page-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-primary" onClick={subscribe} disabled={busy} aria-busy={busy}>
              {busy ? 'Subscribing…' : row?.status === 'unsubscribed' ? 'Subscribe again' : 'Subscribe'}
            </button>
            <span className="field-help">We'll email {user.email} to confirm.</span>
          </div>
        </>
      )}

      {error && (
        <div style={{ marginTop: 12 }}>
          {error.notConfigured
            ? <Notice tone="warning" title="Sending isn't set up yet">The newsletter can't send email until its Resend account and the business details are filled in. Nothing was saved.</Notice>
            : <Notice tone="error">{error.text}</Notice>}
        </div>
      )}
    </section>
  );
}

export default function Newsletter() {
  const [topicId, setTopicId] = usePersistentState('news-topic', 'ai');
  const [source, setSource] = usePersistentState('threads-source', 'all');
  const [hnStories, setHnStories] = useState(null);
  const [hnError, setHnError] = useState('');
  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];
  const aiNews = useSharedFeed('ai_news');
  const threads = useSharedFeed('threads');

  const loadHn = useCallback(async (signal) => {
    if (topic.feed) return;
    setHnStories(null);
    setHnError('');
    const params = new URLSearchParams({ ...topic.params, numericFilters: 'points>5', hitsPerPage: '20' });
    try {
      const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${params}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setHnStories(body.hits.filter((h) => h.title).map(fromHnHit));
    } catch (e) {
      if (e.name === 'AbortError') return;
      setHnError("Couldn't load stories from Hacker News. Check your connection and try again.");
      setHnStories([]);
    }
  }, [topic]);

  useEffect(() => {
    const controller = new AbortController();
    loadHn(controller.signal);
    return () => controller.abort();
  }, [loadHn]);

  const newsItems = topic.feed ? aiNews.items : hnStories;
  const newsError = topic.feed ? aiNews.error : hnError;
  const retryNews = topic.feed ? aiNews.reload : () => loadHn();
  const reddit = threads.sources.reddit;
  const visibleThreads = (threads.items ?? []).filter((t) => source === 'all' || t.source === source);

  return (
    <>
      <PageHeader
        title="Vibecoding News & Community"
        description="AI news, the week's busiest indie-dev threads, and the Weekly Vibe email. Stories open on their original sites."
      />

      <div className="grid-2 newsletter-layout">
        <section aria-labelledby="ai-feed-title">
          <div className="section-header">
            <h2 id="ai-feed-title">Live AI News Feed</h2>
          </div>
          <div className="segmented segmented--wrap" role="group" aria-label="Topic">
            {TOPICS.map((t) => (
              <button key={t.id} type="button" aria-pressed={t.id === topic.id} onClick={() => setTopicId(t.id)}>{t.label}</button>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            {newsError && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retryNews}><RotateCcw aria-hidden="true" /> Try again</button>}>{newsError}</Notice>}
            {newsItems === null ? (
              <div className="card" aria-busy="true" aria-label="Loading stories">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 44, margin: '6px 0' }} />)}
              </div>
            ) : !newsError && <StoryList items={newsItems} empty={`No recent stories for “${topic.label}”. Try another topic.`} />}
          </div>
        </section>

        <div className="newsletter-side">
          <SubscribeCard />

          <section aria-labelledby="threads-title" className="section">
            <div className="section-header">
              <h2 id="threads-title">Trending Community Threads</h2>
              {reddit?.reason !== 'not_configured' && (
                <div className="segmented" role="group" aria-label="Source">
                  {SOURCES.map((s) => (
                    <button key={s.id} type="button" aria-pressed={source === s.id} onClick={() => setSource(s.id)}>{s.label}</button>
                  ))}
                </div>
              )}
            </div>
            {reddit && !reddit.ok && reddit.reason !== 'not_configured' && (
              <p className="field-help" style={{ marginBottom: 8 }}>Reddit isn't answering right now{threads.items?.some((t) => t.source === 'reddit') ? ', so its threads are from earlier today' : ''}.</p>
            )}
            {threads.error && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={threads.reload}><RotateCcw aria-hidden="true" /> Try again</button>}>{threads.error}</Notice>}
            {threads.items === null ? (
              <div className="card" aria-busy="true" aria-label="Loading threads">
                {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, margin: '6px 0' }} />)}
              </div>
            ) : !threads.error && <StoryList items={visibleThreads.slice(0, 15)} empty="No busy threads this week yet." />}
          </section>
        </div>
      </div>

      <p className="field-help section">
        Threads come from Hacker News{reddit?.reason === 'not_configured' ? '' : ' and Reddit (r/indiehackers, r/SideProject, r/iOSProgramming, r/androiddev, r/SaaS)'}, ranked by points and comments over the past week.
        X (Twitter) isn't included because its API is paid. Topic tabs load straight from the public Hacker News search API.
      </p>
    </>
  );
}
