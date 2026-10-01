import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, MessageSquare, RotateCcw } from 'lucide-react';
import { usePersistentState } from '../lib/usePersistentState';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';

// Real stories from Hacker News via its public search API (hn.algolia.com), newest first
const TOPICS = [
  { id: 'indie', label: 'Indie apps', params: { query: 'indie app', tags: 'story' } },
  { id: 'show', label: 'Show HN', params: { query: '', tags: 'show_hn' } },
  { id: 'appstore', label: 'App Store', params: { query: 'App Store', tags: 'story' } },
  { id: 'play', label: 'Google Play', params: { query: 'Google Play', tags: 'story' } },
  { id: 'stripe', label: 'Stripe', params: { query: 'Stripe', tags: 'story' } },
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
    return 'news.ycombinator.com';
  }
};

export default function News() {
  const [topicId, setTopicId] = usePersistentState('news-topic', 'indie');
  const [stories, setStories] = useState(null);
  const [error, setError] = useState('');
  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];

  const load = useCallback(async (signal) => {
    setStories(null);
    setError('');
    const params = new URLSearchParams({ ...topic.params, numericFilters: 'points>5', hitsPerPage: '20' });
    try {
      const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${params}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setStories(body.hits.filter((h) => h.title));
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError("Couldn't load stories from Hacker News. Check your connection and try again.");
      setStories([]);
    }
  }, [topic]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <>
      <PageHeader title="News" description="Recent Hacker News discussions about shipping and selling apps. Stories open on their original sites." />

      <div className="section-header">
        <div className="segmented" role="group" aria-label="Topic">
          {TOPICS.map((t) => (
            <button key={t.id} type="button" aria-pressed={t.id === topic.id} onClick={() => setTopicId(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {error && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => load()}><RotateCcw aria-hidden="true" /> Try again</button>}>{error}</Notice>}

      {stories === null ? (
        <div className="card" aria-busy="true" aria-label="Loading stories">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 44, margin: '6px 0' }} />)}
        </div>
      ) : stories.length === 0 && !error ? (
        <div className="card empty-state"><p>No recent stories for “{topic.label}”. Try another topic.</p></div>
      ) : stories.length > 0 && (
        <ol className="card card--flush news-list">
          {stories.map((s) => {
            const discussion = `https://news.ycombinator.com/item?id=${s.objectID}`;
            return (
              <li key={s.objectID}>
                <a href={s.url || discussion} target="_blank" rel="noreferrer" className="news-title">
                  {s.title} <ExternalLink aria-hidden="true" /><span className="visually-hidden"> (opens in a new tab)</span>
                </a>
                <p className="field-help">
                  {domainOf(s.url)} · {s.points} points · {ago(s.created_at)} ·{' '}
                  <a href={discussion} target="_blank" rel="noreferrer"><MessageSquare aria-hidden="true" className="inline-icon" /> {s.num_comments ?? 0} {s.num_comments === 1 ? 'comment' : 'comments'}<span className="visually-hidden"> on Hacker News (opens in a new tab)</span></a>
                </p>
              </li>
            );
          })}
        </ol>
      )}

      <p className="field-help section">Loaded from the public Hacker News search API (hn.algolia.com). VibeAssist doesn't send it anything about you.</p>
    </>
  );
}
