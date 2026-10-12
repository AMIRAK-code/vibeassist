# VibeAssist

Dashboard, ad tracker and AI business advisor for indie app makers. React + Vite on the front end, Supabase (Auth, Postgres, Edge Functions) behind it.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

`.env.local` needs the project URL and the **publishable** key (Supabase → Project Settings → API Keys). Never put a secret key in it.

## Deploy

The live site is https://vibeassist.assist365.app, a Cloudflare Worker that serves the built files (see `wrangler.jsonc`). `npm run deploy` builds and publishes a new version; pushing to GitHub doesn't.

## Supabase setup

Everything below lives in [`supabase/`](supabase/). The migrations up to `20261005090000_admin_premium.sql` are applied to the project `thwxxgibcbxkfodzoedb`; the ones dated 2026-10-08 come with the restored features and still need applying, in order.

| Piece | What it does |
|---|---|
| `migrations/` | Tables, row level security, sign-up trigger and database functions, in the order they were applied |
| `functions/ai-advisor` | Answers advisor questions with Claude, using the caller's own profile and metrics |
| `functions/stripe-sync` | Connects a user's Stripe restricted key (stored in Vault) and imports their daily revenue |
| `functions/store-sync` | Connects App Store Connect (API key, Sales role) or Google Play (service account + report bucket), stored in Vault, and imports daily downloads, purchases and revenue |
| `functions/billing` | Premium checkout, the Stripe billing portal and on-demand subscription checks |
| `functions/stripe-webhook` | Keeps plans in step with Stripe: new subscriptions, renewals, failed payments, cancellations, and the one-time 60-day pass |
| `functions/legal-docs` | Drafts a privacy policy, terms or EULA with Claude from the user's answers |
| `functions/community-feed` | Hacker News and Reddit threads and AI news, cached for everyone for 30 minutes |
| `functions/newsletter`, `functions/weekly-digest` | Weekly Vibe double opt-in, unsubscribe and the Monday digest through Resend ([docs/newsletter.md](docs/newsletter.md)) |
| `functions/engine`, `functions/engine-ingest`, `functions/gateway` | Anti-Fragile Engine: repo checks, reports from the GitHub Action in [`github-action/`](github-action/), and the Smart Token Gateway ([docs/engine.md](docs/engine.md)) |
| `functions/handoffs` | Context Handoffs: condenses a chat into a handoff with the user's AI and saves only the handoff ([docs/handoffs.md](docs/handoffs.md)) |

To take real payments at vibeassist.assist365.app, follow **[docs/go-live.md](docs/go-live.md)** step by step.

Payments and email each need an account of your own first. **[docs/payments-and-email.md](docs/payments-and-email.md)** covers the Stripe keys and webhook, and connecting an email sender (Supabase's built-in one only emails your own team).

Other one-time settings in the Supabase dashboard:

1. **Authentication → URL Configuration**: set *Site URL* to `http://localhost:5173` and add `http://localhost:5173/**` to *Redirect URLs*, so confirmation and password-reset emails open this app. Add your production URL the same way when you deploy.
2. **Edge Functions → Secrets**: add `ANTHROPIC_API_KEY` to turn on the AI advisor. Without it the advisor replies with a plain summary of the user's numbers.
3. **Authentication → Sign In / Providers → Email** has *Confirm email*. With it on, new users must click the emailed link before signing in.

### Tables

All tables are per user; RLS lets each user see only their own rows.

- `profiles` – onboarding answers (created by a trigger on sign-up)
- `subscriptions` – plan, written only by the billing functions from Stripe; clients can read it, and `choose_plan()` can only switch an old demo plan to Free. Admin Premium (no billing, no end date) is set by hand in the SQL editor: `select public.set_admin_premium('you@example.com');`, and `select public.set_admin_premium('you@example.com', false);` turns it off
- `daily_metrics` – one row per day and source (`manual`, `sample`, `stripe`, `custom_api`, `app_store`, `google_play`)
- `ad_campaigns` – campaigns tracked in the Ad Manager
- `integrations`, `api_keys` – connection status and hashed Custom API keys
- `ai_usage` – advisor requests, for the 30-per-day cap

### Sending data from your own apps (Custom API)

Generate a key on the Integrations page, then post daily numbers:

```bash
curl -X POST "https://<project-ref>.supabase.co/rest/v1/rpc/ingest_metrics" \
  -H "apikey: <publishable key>" \
  -H "Content-Type: application/json" \
  -d '{"p_api_key": "va_...", "p_rows": [{"date": "2026-10-01", "revenue": 120.5, "organic_downloads": 40, "paid_downloads": 12, "purchases": 5, "active_users": 800}]}'
```

Up to 366 days per request. A day you send again replaces the earlier Custom API values for that day.

## Not real yet

- **Ad network accounts** can't be linked directly (each network has to approve API access first). Import each network's campaign report as CSV in the Ad Manager instead.
- **Store imports** convert proceeds with ECB daily reference rates, which differ a little from what the stores pay out; Google's fee is estimated from the rate you pick.
