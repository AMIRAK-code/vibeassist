# VibeAssist

Dashboard, ad tracker and AI business advisor for indie app makers. React + Vite on the front end, Supabase (Auth, Postgres, Edge Functions) behind it.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

`.env.local` needs the project URL and the **publishable** key (Supabase → Project Settings → API Keys). Never put a secret key in it.

## Supabase setup

Everything below lives in [`supabase/`](supabase/) and is already applied to the project `thwxxgibcbxkfodzoedb`.

| Piece | What it does |
|---|---|
| `migrations/20261001150000_vibeassist_schema.sql` | Tables, row level security, sign-up trigger and database functions |
| `functions/ai-advisor` | Answers advisor questions with Claude, using the caller's own profile and metrics |
| `functions/stripe-sync` | Connects a Stripe restricted key (stored in Vault) and imports daily revenue |

One-time settings in the Supabase dashboard:

1. **Authentication → URL Configuration**: set *Site URL* to `http://localhost:5173` and add `http://localhost:5173/**` to *Redirect URLs*, so confirmation and password-reset emails open this app. Add your production URL the same way when you deploy.
2. **Edge Functions → Secrets**: add `ANTHROPIC_API_KEY` to turn on the AI advisor. Without it the advisor replies with a plain summary of the user's numbers.
3. Optional for development: **Authentication → Sign In / Providers → Email** has *Confirm email*. With it on, new users must click the emailed link before signing in, and Supabase's built-in mailer only sends a few emails per hour.

### Tables

All tables are per user; RLS lets each user see only their own rows.

- `profiles` – onboarding answers (created by a trigger on sign-up)
- `subscriptions` – plan; clients can read it but only change it through `choose_plan()`
- `daily_metrics` – one row per day and source (`manual`, `sample`, `stripe`, `custom_api`)
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

- **Payments**: `choose_plan()` switches plans without charging. Replace it with Stripe Checkout and a webhook before taking money.
- **Google Play, App Store and ad network accounts** can't be connected yet; use manual entry or the Custom API.
