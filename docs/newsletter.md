# Weekly Vibe and community feeds: setup

The News & Newsletter page works in three layers. Each one shows an honest "not set up yet"
state until its piece is in place.

| Piece | Works without setup? | Needs |
|---|---|---|
| AI news and Hacker News threads | Yes, once `community-feed` is deployed | nothing |
| Reddit threads | No, the page shows Hacker News only | a Reddit app |
| Subscribe and confirm | No, the page says sending isn't set up | Resend and the business details |
| Monday sending | No | the above, plus the schedule migration |

## 1. Database and functions

1. Apply `supabase/migrations/20261008120000_news_and_newsletter.sql`. It only creates tables and
   functions in `public`.
2. Deploy the functions:
   - `community-feed`, with JWT checks on.
   - `newsletter` and `weekly-digest`, with JWT checks **off**. Email links and the cron job have
     no session, so both functions check auth themselves.

## 2. Business details

Fill in `supabase/functions/_shared/business.js`: name, postal address and support email.
Nothing is emailed while these are blank, because EU rules require them in every newsletter.

## 3. Resend

1. In Resend, add the domain `assist365.app` in the **EU (eu-west-1)** region and add the DNS
   records it shows. Add a DMARC record too, for example `v=DMARC1; p=none; rua=mailto:you@…`.
2. Turn **off** open and click tracking for the domain. Tracking would need separate consent.
3. Create an API key with "Sending access" for that domain only.
4. The free plan sends 100 emails a day. Move to Pro before the list passes about 90 people.

## 4. Function secrets (Edge Functions → Secrets)

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | the sending key from step 3 |
| `NEWSLETTER_FROM` | `The Weekly Vibe <newsletter@assist365.app>` |
| `SITE_URL` | `https://vibeassist.assist365.app` (already set for billing) |
| `CRON_SECRET` | a long random value, for example from `openssl rand -hex 32` |
| `NEWSLETTER_OWNER_EMAILS` | your account email(s), comma separated. Owners can send a test and run an issue by hand. |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | optional. Create a "script" app at reddit.com/prefs/apps. Reddit's terms may need their approval for commercial use. |
| `REDDIT_USER_AGENT` | optional, for example `web:app.assist365.vibeassist:1.0 (by /u/yourname)` |

## 5. The Monday schedule

**This changes the whole shared Supabase project.** It turns on `pg_cron` and `pg_net`.

1. In the SQL editor, store the same `CRON_SECRET` value in Vault once:
   `select vault.create_secret('<CRON_SECRET value>', 'vibeassist_cron_secret', 'VibeAssist: weekly digest cron');`
2. Apply `supabase/migrations/20261008130000_weekly_vibe_schedule.sql`.

The job `vibeassist-weekly-vibe` runs every 10 minutes from 08:00 to 11:50 UTC on Mondays:

- The first run creates the week's issue and sends it.
- Later runs finish long lists and retry failures.
- Each subscriber can get at most one email per week, so repeats are safe.

## 6. Check it

1. Subscribe on News & Newsletter, then press the button in the confirmation email.
2. In Settings → Weekly Vibe email, press **Preview this week's email**, then **Send me a test**
   (owners only).
3. To send an issue now instead of waiting for Monday, call the function as an owner:
   `{"action": "run"}`. It still sends each person at most once that week.
