import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFeed, fromHn, fromReddit, hnUrl, rank, type FeedItem } from './feeds.ts';
import { numbersRows, renderConfirm, renderDigest, weekStart } from './newsletter.ts';
import { ResendError, sendBatch } from './resend.ts';
import { businessReady } from './business.js';

afterEach(() => vi.unstubAllGlobals());

const item = (id: string, values: Partial<FeedItem> = {}): FeedItem => ({
  id, source: 'hn', community: 'Hacker News', title: `Story ${id}`, url: `https://example.com/${id}`,
  comments_url: `https://news.ycombinator.com/item?id=${id}`, points: 10, comments: 2, created_at: '2026-10-07T10:00:00Z', ...values,
});

describe('feeds', () => {
  it('maps Hacker News and Reddit posts and refuses unsafe links', () => {
    expect(fromHn({ objectID: '1', title: ' Show  HN: thing ', url: 'javascript:alert(1)', points: 5, num_comments: 3, created_at: '2026-10-07T00:00:00Z', _tags: ['show_hn'] }))
      .toMatchObject({ id: 'hn:1', community: 'Show HN', title: 'Show HN: thing', url: 'https://news.ycombinator.com/item?id=1' });
    expect(fromReddit({ id: 'a', title: 'Launched', subreddit: 'SideProject', permalink: '/r/SideProject/comments/a/x/', is_self: true, score: 40, num_comments: 9, created_utc: 1_760_000_000 }))
      .toMatchObject({ id: 'reddit:a', community: 'r/SideProject', url: 'https://www.reddit.com/r/SideProject/comments/a/x/', points: 40 });
    expect(fromReddit({ id: 'b', title: 'Pinned', stickied: true, permalink: '/x' })).toBeNull();
    expect(hnUrl({ tags: 'story', query: 'SaaS' }, 100, 5).searchParams.get('numericFilters')).toBe('created_at_i>100,points>5');
  });

  it('ranks busy recent posts first and drops duplicate links', () => {
    const now = new Date('2026-10-08T10:00:00Z').getTime();
    const ranked = rank([
      item('old', { points: 500, created_at: '2026-10-01T10:00:00Z' }),
      item('fresh', { points: 50, created_at: '2026-10-08T08:00:00Z' }),
      item('dup', { url: 'https://example.com/fresh/', points: 1 }),
    ], now);
    expect(ranked.map((i) => i.id)).toEqual(['fresh', 'old']);
  });

  it('keeps Reddit items from the last good fetch for a day when Reddit fails', async () => {
    const now = new Date('2026-10-08T10:00:00Z').getTime();
    const fetchFn = vi.fn(async (url: string | URL) => {
      if (String(url).includes('hn.algolia.com')) return new Response(JSON.stringify({ hits: [] }));
      return new Response('{}', { status: 403 });
    });
    const previous = {
      items: [item('r1', { source: 'reddit', id: 'reddit:r1', url: 'https://reddit.com/r1' })],
      sources: { reddit: { ok: true, at: '2026-10-08T08:00:00Z', lastOkAt: '2026-10-08T08:00:00Z' } },
    };
    const result = await buildFeed('threads', { clientId: 'id', clientSecret: 's', userAgent: 'ua' }, previous, fetchFn as typeof fetch, now);
    expect(result.sources.reddit).toMatchObject({ ok: false, reason: 'blocked', lastOkAt: '2026-10-08T08:00:00Z' });
    expect(result.items.map((i) => i.id)).toEqual(['reddit:r1']);
    const noReddit = await buildFeed('threads', null, null, fetchFn as typeof fetch, now);
    expect(noReddit.sources.reddit).toMatchObject({ ok: false, reason: 'not_configured' });
  });
});

describe('Weekly Vibe email', () => {
  const issue = { week_start: '2026-10-05', threads: [item('1', { title: 'Ship <it> & tell' })], news: [] };
  const links = { site: 'https://app.test', unsubscribe: 'https://app.test/newsletter/unsubscribe?t=tok', manage: 'https://app.test/settings', privacy: 'https://app.test/privacy' };
  const business = { name: 'Faraz Haghgoo', address: 'Via Roma 1, Milano', email: 'support@assist365.app' };
  const totals = (revenue: number, downloads: number, days = 7) => ({ revenue, fees: 10, ad_spend: 40, downloads, days });

  it('shows the subscriber their own week with changes, escaped', () => {
    const payload = { include_numbers: true, unsubscribe_token: 'tok', name: 'Faraz H', currency: 'EUR', current: totals(1200, 300), previous: totals(1000, 400) };
    const { subject, html, text } = renderDigest(issue, payload, 'f@example.com', links, business);
    expect(subject).toBe('The Weekly Vibe · October 5');
    expect(html).toContain('Ship &lt;it&gt; &amp; tell');
    expect(html).not.toContain('<it>');
    expect(text).toContain('Revenue: €1,200 (▲ 20% vs the week before)');
    expect(text).toContain('Downloads: 300 (▼ 25% vs the week before)');
    expect(text).toContain('Unsubscribe: https://app.test/newsletter/unsubscribe?t=tok');
    expect(html).toContain('Via Roma 1, Milano');
  });

  it('asks for numbers when the week is empty and leaves them out when not wanted', () => {
    expect(numbersRows({ include_numbers: true, unsubscribe_token: 't', current: totals(0, 0, 0) })).toEqual([]);
    expect(numbersRows({ include_numbers: false, unsubscribe_token: 't' })).toBeNull();
    expect(renderDigest(issue, { include_numbers: false, unsubscribe_token: 't' }, 'f@example.com', links, business).text).not.toContain('YOUR LAST WEEK');
  });

  it('builds the confirmation email and knows when business details are missing', () => {
    expect(renderConfirm('https://app.test/newsletter/confirm?token=x', 'f@example.com', business).text).toContain('https://app.test/newsletter/confirm?token=x');
    expect(businessReady({ name: 'A', address: '', email: 'e' })).toBe(false);
    expect(businessReady(business)).toBe(true);
  });

  it('works out the Monday of the week in Rome', () => {
    expect(weekStart(new Date('2026-10-12T07:30:00Z'))).toBe('2026-10-12'); // Monday morning
    expect(weekStart(new Date('2026-10-11T23:30:00Z'))).toBe('2026-10-12'); // already Monday in Rome
    expect(weekStart(new Date('2026-10-15T12:00:00Z'))).toBe('2026-10-12');
  });
});

describe('Resend', () => {
  it('sends a batch with an idempotency key and reports errors by name', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'e1' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'rate_limit_exceeded', message: 'slow down' }), { status: 429 }));
    const email = { from: 'a@b.c', to: ['x@y.z'], subject: 's', html: 'h', text: 't' };
    expect(await sendBatch('re_key', [email], 'issue:1:batch', fetchFn)).toEqual(['e1']);
    expect(fetchFn.mock.calls[0][1].headers['Idempotency-Key']).toBe('issue:1:batch');
    const error = await sendBatch('re_key', [email], 'k', fetchFn).catch((e) => e);
    expect(error).toBeInstanceOf(ResendError);
    expect(error.status).toBe(429);
  });
});
