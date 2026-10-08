// Community threads and AI news for the News & Newsletter page and the Weekly Vibe email.
// Hacker News comes from its public search API; Reddit from its API with an app-only token
// (needs REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET). Headlines and links only.

export type FeedItem = {
  id: string;
  source: 'hn' | 'reddit';
  community: string;
  title: string;
  url: string;
  comments_url: string;
  points: number;
  comments: number;
  created_at: string;
};
export type SourceState = { ok: boolean; reason?: 'not_configured' | 'blocked' | 'error'; at: string; lastOkAt?: string };
export type RedditCredentials = { clientId: string; clientSecret: string; userAgent: string };

const HN_SEARCH = 'https://hn.algolia.com/api/v1/search';
const SUBREDDITS = ['indiehackers', 'SideProject', 'iOSProgramming', 'androiddev', 'SaaS'];

export const FEEDS = {
  threads: {
    days: 7,
    minPoints: 5,
    hn: [
      { tags: 'ask_hn' },
      { tags: 'show_hn' },
      { tags: 'story', query: 'indie app' },
      { tags: 'story', query: 'app store' },
      { tags: 'story', query: 'side project' },
      { tags: 'story', query: 'SaaS' },
      { tags: 'story', query: 'AI coding' },
    ],
    reddit: true,
  },
  ai_news: {
    days: 3,
    minPoints: 30,
    hn: ['LLM', 'Claude', 'OpenAI', 'Cursor', 'AI agents', 'AI coding'].map((query) => ({ tags: 'story', query })),
    reddit: false,
  },
} as const;
export type FeedName = keyof typeof FEEDS;

const safeUrl = (url: unknown) => (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null);
const plain = (text: unknown) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

export function hnUrl(params: { tags: string; query?: string }, sinceSeconds: number, minPoints: number) {
  const url = new URL(HN_SEARCH);
  url.searchParams.set('tags', params.tags);
  if (params.query) url.searchParams.set('query', params.query);
  url.searchParams.set('numericFilters', `created_at_i>${sinceSeconds},points>${minPoints}`);
  url.searchParams.set('hitsPerPage', '30');
  return url;
}

// deno-lint-ignore no-explicit-any
export function fromHn(hit: any): FeedItem | null {
  const title = plain(hit.title);
  if (!title || !hit.objectID) return null;
  const discussion = `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`;
  const tags: string[] = hit._tags ?? [];
  return {
    id: `hn:${hit.objectID}`,
    source: 'hn',
    community: tags.includes('ask_hn') ? 'Ask HN' : tags.includes('show_hn') ? 'Show HN' : 'Hacker News',
    title,
    url: safeUrl(hit.url) ?? discussion,
    comments_url: discussion,
    points: Number(hit.points) || 0,
    comments: Number(hit.num_comments) || 0,
    created_at: hit.created_at ?? new Date((Number(hit.created_at_i) || 0) * 1000).toISOString(),
  };
}

// deno-lint-ignore no-explicit-any
export function fromReddit(post: any): FeedItem | null {
  if (!post || post.stickied || post.over_18) return null;
  const title = plain(post.title);
  if (!title || !post.id || !post.permalink) return null;
  const permalink = `https://www.reddit.com${post.permalink}`;
  return {
    id: `reddit:${post.id}`,
    source: 'reddit',
    community: `r/${post.subreddit}`,
    title,
    url: post.is_self ? permalink : safeUrl(post.url) ?? permalink,
    comments_url: permalink,
    points: Number(post.score) || 0,
    comments: Number(post.num_comments) || 0,
    created_at: new Date((Number(post.created_utc) || 0) * 1000).toISOString(),
  };
}

// Recent and busy first: points and comments, discounted by age. One entry per link.
export function rank(items: FeedItem[], now = Date.now(), limit = 30) {
  const score = (item: FeedItem) => {
    const hours = Math.max(0, (now - new Date(item.created_at).getTime()) / 36e5);
    return (item.points + 2 * item.comments) / Math.pow(hours + 2, 1.5);
  };
  const seen = new Set<string>();
  return [...items]
    .sort((a, b) => score(b) - score(a))
    .filter((item) => {
      const key = item.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
      if (seen.has(key) || seen.has(item.id)) return false;
      seen.add(key);
      seen.add(item.id);
      return true;
    })
    .slice(0, limit);
}

export async function fetchHn(feed: FeedName, fetchFn: typeof fetch = fetch, now = Date.now()) {
  const config = FEEDS[feed];
  const since = Math.floor(now / 1000) - config.days * 86400;
  const results = await Promise.allSettled(config.hn.map(async (params) => {
    const res = await fetchFn(hnUrl(params, since, config.minPoints));
    if (!res.ok) throw new Error(`Hacker News returned ${res.status}`);
    const body = await res.json();
    return (body.hits ?? []).map(fromHn).filter(Boolean) as FeedItem[];
  }));
  const ok = results.filter((r): r is PromiseFulfilledResult<FeedItem[]> => r.status === 'fulfilled');
  if (!ok.length) throw new Error('Hacker News is unavailable');
  return ok.flatMap((r) => r.value);
}

export async function fetchReddit(creds: RedditCredentials, fetchFn: typeof fetch = fetch) {
  const tokenRes = await fetchFn('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': creds.userAgent,
    },
    body: 'grant_type=client_credentials',
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) throw new Error(`Reddit sign-in returned ${tokenRes.status}`);
  const res = await fetchFn(`https://oauth.reddit.com/r/${SUBREDDITS.join('+')}/top?t=week&limit=50&raw_json=1`, {
    headers: { Authorization: `Bearer ${token.access_token}`, 'User-Agent': creds.userAgent },
  });
  if (!res.ok) throw new Error(`Reddit returned ${res.status}`);
  const body = await res.json();
  // deno-lint-ignore no-explicit-any
  return (body?.data?.children ?? []).map((c: any) => fromReddit(c?.data)).filter(Boolean) as FeedItem[];
}

// Builds a feed from every source that answers. When Reddit fails, its items from the previous
// fetch are kept for up to a day, so one bad minute doesn't empty the list.
export async function buildFeed(
  feed: FeedName,
  reddit: RedditCredentials | null,
  previous: { items: FeedItem[]; sources: Record<string, SourceState> } | null,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
) {
  const at = new Date(now).toISOString();
  const sources: Record<string, SourceState> = {};
  const items: FeedItem[] = [];

  try {
    items.push(...await fetchHn(feed, fetchFn, now));
    sources.hn = { ok: true, at };
  } catch {
    sources.hn = { ok: false, reason: 'error', at };
    items.push(...(previous?.items ?? []).filter((i) => i.source === 'hn'));
  }

  if (FEEDS[feed].reddit) {
    if (!reddit) {
      sources.reddit = { ok: false, reason: 'not_configured', at };
    } else {
      try {
        items.push(...await fetchReddit(reddit, fetchFn));
        sources.reddit = { ok: true, at, lastOkAt: at };
      } catch (error) {
        const blocked = /\b(403|429)\b/.test(String((error as Error)?.message));
        const lastOkAt = previous?.sources?.reddit?.lastOkAt;
        sources.reddit = { ok: false, reason: blocked ? 'blocked' : 'error', at, lastOkAt };
        if (lastOkAt && now - new Date(lastOkAt).getTime() < 864e5) {
          items.push(...(previous?.items ?? []).filter((i) => i.source === 'reddit'));
        }
      }
    }
  }
  return { items: rank(items, now), sources };
}
