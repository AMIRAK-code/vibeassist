import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, ExternalLink, MailCheck, MessageSquare, RotateCcw, Sparkles } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { callFunction, friendlyError, supabase } from '../lib/supabase';
import { usePersistentState } from '../lib/usePersistentState';
import { completeWithUserAi, useImportedAi } from '../lib/aiClient';
import { CONSENT_TEXT } from '../../supabase/functions/_shared/consent.js';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';
import ModelSelectorPill from '../components/ModelSelectorPill';

const TOPICS = [
  { id: 'ai', label: 'AI news', feed: 'ai_news' },
  { id: 'indie', label: 'Indie apps', params: { query: 'indie app', tags: 'story' } },
  { id: 'show', label: 'Show HN', params: { query: '', tags: 'show_hn' } },
  { id: 'appstore', label: 'App Store', params: { query: 'App Store', tags: 'story' } },
  { id: 'play', label: 'Google Play', params: { query: 'Google Play', tags: 'story' } },
  { id: 'stripe', label: 'Stripe', params: { query: 'Stripe', tags: 'story' } },
  { id: 'bookmarks', label: 'Saved' },
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

const fromHnHit = (h) => {
  const discussion = `https://news.ycombinator.com/item?id=${h.objectID}`;
  return { id: `hn:${h.objectID}`, source: 'hn', community: 'Hacker News', title: h.title, url: h.url || discussion, comments_url: discussion, points: h.points ?? 0, comments: h.num_comments ?? 0, created_at: h.created_at };
};

function StoryList({ items, empty, savedIds, onToggleSave }) {
  if (!items.length) return <div className="card empty-state"><p>{empty}</p></div>;
  return (
    <ol className="card card--flush news-list">
      {items.map((s) => {
        const isSaved = savedIds?.has(s.id);
        return (
          <li key={s.id} className="news-item-row">
            <div style={{ flex: 1, minWidth: 0 }}>
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
            </div>
            {onToggleSave && (
              <button
                type="button"
                className={`btn btn-ghost btn-sm${isSaved ? ' is-saved-bm' : ''}`}
                aria-pressed={Boolean(isSaved)}
                aria-label={isSaved ? `Remove bookmark for ${s.title}` : `Bookmark ${s.title}`}
                onClick={() => onToggleSave(s)}
              >
                <Bookmark aria-hidden="true" />
              </button>
            )}
          </li>
        );
      })}
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
    const t = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);
  return { ...state, reload: load };
}

function SubscribeCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [row, setRow] = useState(undefined);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const { data, error: readError } = await supabase.from('newsletter_subscribers').select('status, include_numbers, confirm_sent_at').maybeSingle();
    if (readError) setError({ text: friendlyError(readError, 'Could not check your subscription.') });
    setRow(data ?? null);
    if (data) setIncludeNumbers(data.include_numbers);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(t);
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
      <p className="card-subtitle">Every Monday: the week&apos;s top indie-dev threads and AI news, plus how your own week went.</p>

      {row === undefined ? (
        <div className="skeleton" style={{ height: 60, marginTop: 12 }} aria-busy="true" aria-label="Checking your subscription" />
      ) : row?.status === 'active' ? (
        <>
          <p className="subscribe-state"><MailCheck aria-hidden="true" /> You&apos;re subscribed at {user.email}.</p>
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
            <span className="field-help">We&apos;ll email {user.email} to confirm.</span>
          </div>
        </>
      )}

      {error && (
        <div style={{ marginTop: 12 }}>
          {error.notConfigured
            ? <Notice tone="warning" title="Sending isn't set up yet">The newsletter can&apos;t send email until its Resend account and the business details are filled in. Nothing was saved.</Notice>
            : <Notice tone="error">{error.text}</Notice>}
        </div>
      )}
    </section>
  );
}

export default function Newsletter() {
  const { active: newsAi } = useImportedAi('newsletter');
  const [topicId, setTopicId] = usePersistentState('news-topic', 'ai');
  const [source, setSource] = usePersistentState('threads-source', 'all');
  const [bookmarks, setBookmarks] = usePersistentState('news-bookmarks', []);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest'); // latest | points
  const [hnStories, setHnStories] = useState(null);
  const [hnError, setHnError] = useState('');
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [briefError, setBriefError] = useState('');

  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];
  const aiNews = useSharedFeed('ai_news');
  const threads = useSharedFeed('threads');
  const savedIds = useMemo(() => new Set((bookmarks ?? []).map((b) => b.id)), [bookmarks]);

  const toggleBookmark = (story) => {
    setBookmarks(savedIds.has(story.id)
      ? bookmarks.filter((b) => b.id !== story.id)
      : [story, ...(bookmarks ?? [])].slice(0, 60));
  };

  const loadHn = useCallback(async (signal) => {
    if (topic.feed || topic.id === 'bookmarks') return;
    setHnStories(null);
    setHnError('');
    const params = new URLSearchParams({ ...topic.params, numericFilters: 'points>5', hitsPerPage: '25' });
    try {
      const endpoint = sortBy === 'points' ? 'search' : 'search_by_date';
      const res = await fetch(`https://hn.algolia.com/api/v1/${endpoint}?${params}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setHnStories(body.hits.filter((h) => h.title).map(fromHnHit));
    } catch (e) {
      if (e.name === 'AbortError') return;
      setHnError("Couldn't load stories from Hacker News. Check your connection and try again.");
      setHnStories([]);
    }
  }, [topic, sortBy]);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => { loadHn(controller.signal); }, 0);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [loadHn]);

  const rawNewsItems = topic.id === 'bookmarks'
    ? bookmarks
    : topic.feed ? aiNews.items : hnStories;

  const newsItems = useMemo(() => {
    if (rawNewsItems === null) return null;
    const q = query.trim().toLowerCase();
    const list = q
      ? rawNewsItems.filter((s) => `${s.title} ${s.community}`.toLowerCase().includes(q))
      : [...rawNewsItems];
    if (sortBy === 'points') list.sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    return list;
  }, [rawNewsItems, query, sortBy]);

  const newsError = topic.id === 'bookmarks' ? '' : (topic.feed ? aiNews.error : hnError);
  const retryNews = topic.feed ? aiNews.reload : () => loadHn();
  const reddit = threads.sources.reddit;
  const visibleThreads = (threads.items ?? []).filter((t) => {
    if (source !== 'all' && t.source !== source) return false;
    if (query.trim() && !`${t.title} ${t.community}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const summarizeFeed = async () => {
    if (!newsAi || !newsItems?.length || briefBusy) return;
    setBriefBusy(true);
    setBriefError('');
    try {
      const headlines = newsItems.slice(0, 12).map((s, i) => `${i + 1}. ${s.title} (${s.points} pts, ${s.community})`).join('\n');
      const res = await completeWithUserAi({
        connection: newsAi,
        system: 'Summarize the key trends and actionable takeaways for an indie software founder in 4 concise bullet points.',
        messages: [{ role: 'user', content: headlines }],
        maxTokens: 450,
      });
      setBriefText(res.text);
    } catch (err) {
      setBriefError(err?.message || 'Could not summarize stories.');
    } finally {
      setBriefBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Vibecoding News & Community"
        description="AI news, top indie-dev threads, bookmarks, and an AI trend brief powered by your imported model."
      />

      <div className="page-actions section" style={{ marginTop: 0, marginBottom: 14 }}>
        <label className="visually-hidden" htmlFor="news-search">Filter stories</label>
        <input
          id="news-search"
          type="search"
          className="input-field input-sm"
          style={{ flex: 1, minWidth: 220 }}
          placeholder="Search stories & threads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="segmented" role="group" aria-label="Sort order">
          <button type="button" aria-pressed={sortBy === 'latest'} onClick={() => setSortBy('latest')}>Latest</button>
          <button type="button" aria-pressed={sortBy === 'points'} onClick={() => setSortBy('points')}>Top points</button>
        </div>
      </div>

      <div className="grid-2 newsletter-layout">
        <section aria-labelledby="ai-feed-title">
          <div className="section-header">
            <h2 id="ai-feed-title">Live AI News Feed</h2>
          </div>
          <div className="segmented segmented--wrap" role="group" aria-label="Topic">
            {TOPICS.map((t) => (
              <button key={t.id} type="button" aria-pressed={t.id === topic.id} onClick={() => setTopicId(t.id)}>
                {t.id === 'bookmarks' ? `${t.label} (${bookmarks?.length ?? 0})` : t.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            {newsError && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={retryNews}><RotateCcw aria-hidden="true" /> Try again</button>}>{newsError}</Notice>}
            {newsItems === null ? (
              <div className="card" aria-busy="true" aria-label="Loading stories">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 44, margin: '6px 0' }} />)}
              </div>
            ) : !newsError && (
              <StoryList
                items={newsItems}
                savedIds={savedIds}
                onToggleSave={toggleBookmark}
                empty={topic.id === 'bookmarks' ? 'No saved stories yet. Click the bookmark button on any story.' : `No recent stories for “${topic.label}”.`}
              />
            )}
          </div>
        </section>

        <div className="newsletter-side">
          <section className="card" aria-labelledby="ai-brief-title" style={{ marginBottom: 16 }}>
            <div className="section-header">
              <h2 id="ai-brief-title" className="card-title"><Sparkles className="inline-icon" aria-hidden="true" /> AI Trend Brief</h2>
              {newsAi && newsItems?.length > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={summarizeFeed} disabled={briefBusy}>
                  {briefBusy ? 'Summarizing…' : `Summarize (${newsAi.label})`}
                </button>
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <ModelSelectorPill feature="newsletter" allowCloud={false} />
            </div>
            {briefError && <div style={{ marginTop: 10 }}><Notice tone="error">{briefError}</Notice></div>}
            {briefText && <pre className="code-block" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{briefText}</pre>}
          </section>

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
              <p className="field-help" style={{ marginBottom: 8 }}>Reddit isn&apos;t answering right now{threads.items?.some((t) => t.source === 'reddit') ? ', so its threads are from earlier today' : ''}.</p>
            )}
            {threads.error && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={threads.reload}><RotateCcw aria-hidden="true" /> Try again</button>}>{threads.error}</Notice>}
            {threads.items === null ? (
              <div className="card" aria-busy="true" aria-label="Loading threads">
                {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, margin: '6px 0' }} />)}
              </div>
            ) : !threads.error && (
              <StoryList
                items={visibleThreads.slice(0, 15)}
                savedIds={savedIds}
                onToggleSave={toggleBookmark}
                empty="No busy threads match right now."
              />
            )}
          </section>
        </div>
      </div>

      <p className="field-help section">
        Threads come from Hacker News{reddit?.reason === 'not_configured' ? '' : ' and Reddit (r/indiehackers, r/SideProject, r/iOSProgramming, r/androiddev, r/SaaS)'}, ranked by points and comments over the past week.
      </p>
    </>
  );
}
