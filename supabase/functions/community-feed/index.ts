// Trending community threads (Hacker News + Reddit) and AI news for the News & Newsletter page.
// One shared cache, refreshed at most every 30 minutes, so users never wait on Reddit or HN.
//
// POST { feed: 'threads' | 'ai_news' } -> { feed, items, fetched_at, stale, sources }
// Optional secrets for Reddit: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, projectKey } from '../_shared/http.ts';
import { buildFeed, FEEDS, type FeedName, type RedditCredentials } from '../_shared/feeds.ts';

const FRESH_MS = 30 * 60 * 1000;

function redditCredentials(): RedditCredentials | null {
  const clientId = Deno.env.get('REDDIT_CLIENT_ID');
  const clientSecret = Deno.env.get('REDDIT_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, userAgent: Deno.env.get('REDDIT_USER_AGENT') ?? 'web:app.assist365.vibeassist:1.0' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(url, projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authError } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (authError || !userData?.user) return json({ error: 'Sign in first.' }, 401);

  let body: { feed?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }
  const feed = body.feed as FeedName;
  if (!(feed in FEEDS)) return json({ error: 'Unknown feed.' }, 400);

  // The cache is shared by everyone and holds only public headlines
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: cached } = await admin.from('feed_cache').select('items, sources, fetched_at').eq('feed', feed).maybeSingle();
  const fresh = cached?.fetched_at && Date.now() - new Date(cached.fetched_at).getTime() < FRESH_MS;
  if (fresh) return json({ feed, items: cached.items, fetched_at: cached.fetched_at, stale: false, sources: cached.sources });

  const refresh = async () => {
    const { data: claimed, error } = await admin.rpc('claim_feed_refresh', { p_feed: feed });
    if (error || !claimed) return null;
    const built = await buildFeed(feed, redditCredentials(), cached ? { items: cached.items ?? [], sources: cached.sources ?? {} } : null);
    const fetchedAt = new Date().toISOString();
    if (built.items.length || !cached?.items?.length) {
      await admin.from('feed_cache').update({ items: built.items, sources: built.sources, fetched_at: fetchedAt, refreshing_until: null }).eq('feed', feed);
    } else {
      // Every source failed: keep the old items, try again on the next request
      await admin.from('feed_cache').update({ sources: built.sources, refreshing_until: null }).eq('feed', feed);
    }
    return { ...built, fetched_at: fetchedAt };
  };

  // Nothing to show yet: this one request waits for the first fetch
  if (!cached?.items?.length) {
    try {
      const built = await refresh();
      if (built) return json({ feed, items: built.items, fetched_at: built.fetched_at, stale: false, sources: built.sources });
    } catch (error) {
      console.error(`Could not build the ${feed} feed`, error);
    }
    return json({ error: "Couldn't load community threads right now. Try again in a minute." }, 503);
  }

  // Stale: answer straight away with what we have and refresh in the background
  EdgeRuntime.waitUntil(refresh().catch((error) => console.error(`Background refresh of ${feed} failed`, error)));
  return json({ feed, items: cached.items, fetched_at: cached.fetched_at, stale: true, sources: cached.sources });
});
