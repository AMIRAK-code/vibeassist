# Going live at vibeassist.assist365.app

Everything in the code is ready for real payments. What's left needs your accounts, your
identity or your money, so it has to be done by you. Work through it in this order: steps 1–5
with Stripe in **test mode**, step 6 to switch to real money.

## 1. Fill in your business details

Open `src/lib/business.js` and fill in your legal name, address, Partita IVA and a support
email address (for example `support@assist365.app`). They appear on the Terms, Privacy and
Refunds pages and in the homepage footer, which Stripe and Italian law expect.

Then read those three pages (`/terms`, `/privacy`, `/refunds`). They're starting drafts that
match what the app does, not legal advice. Two choices in them are yours to confirm:

- **14-day refund on the first payment.** Simple, and it sidesteps the EU 14-day withdrawal
  rules for digital services. Change it if you want a different policy.
- **Prices shown without VAT** ("plus VAT where it applies"), with Stripe adding it at
  checkout. EU rules generally expect consumer prices to include VAT; ask your accountant. If
  needed, VAT can be included in the price instead (a one-line change in the billing code).

To receive email at `support@assist365.app`, add it under Cloudflare → `assist365.app` →
**Email → Email Routing** and forward it to your inbox (you already use Email Routing).

## 2. The website (Cloudflare)

The site is online. It runs as a Cloudflare Worker called `vibeassist` that serves the built
files, the same way exam.assist365.app does, and Cloudflare looks after the DNS record and
certificate for `vibeassist.assist365.app`. Settings live in `wrangler.jsonc`; the Supabase
address and public key come from `.env.production`.

To publish a new version, run:

```bash
npm run deploy
```

It builds the app and uploads `dist/`. Pushing to GitHub doesn't deploy by itself. The first
time on a new computer, run `npx wrangler login` with the Cloudflare login that holds
`assist365.app`.

## 3. Tell Supabase about the address

- **Authentication → URL Configuration**: Site URL `https://vibeassist.assist365.app`.
  Redirect URLs: `https://vibeassist.assist365.app/**` and `http://localhost:5173/**`.
- **Edge Functions → Secrets**: `SITE_URL` = `https://vibeassist.assist365.app`.
- **Plan**: the project is on Supabase's Free plan, which pauses after a week without
  activity. Paying customers can't use a paused app, so move to **Pro** before launch.

## 4. Send email from assist365.app (Resend)

1. Create a Resend account, **Domains → Add domain** → `assist365.app`. Add the DNS records it
   shows in Cloudflare → DNS (Resend can also add them for you). They live on `send.` and
   `resend._domainkey.` and don't touch your existing Email Routing.
2. Wait for **Verified**, then **API Keys → Create** with sending access.
3. Supabase → **Authentication → Emails → SMTP Settings** → turn on custom SMTP:
   host `smtp.resend.com`, port `465`, username `resend`, password the API key,
   sender `no-reply@assist365.app`, name `VibeAssist`.
4. Supabase → **Authentication → Rate Limits**: raise emails per hour to fit your sign-ups.

Test by signing up on the live site with an address that isn't in your Supabase team.

## 5. Stripe in test mode, including tax

Follow [payments-and-email.md](payments-and-email.md) part 1 (test secret key, webhook,
customer portal), plus:

- Stripe → **Tax**: add your business (head office) address and turn Stripe Tax on. Checkout
  refuses to open until this is done, with a message saying so.
- In the customer portal settings, allow customers to update their **billing address and tax
  ID**.

Then on the live site: sign up, open **Plans**, pay with `4242 4242 4242 4242`. Check that VAT
appears at checkout for an Italian address, that you land on "Premium is on", and that
**Settings → Manage billing** opens and cancelling works.

## 6. Switch to real money

1. Stripe → **Activate payments**: business details (Partita IVA, address), the bank account
   for payouts and identity verification. Under **Settings → Public details**, set the support
   email, `https://vibeassist.assist365.app` and the Terms, Privacy and Refunds links.
2. Stripe → **Tax → Registrations**: add Italy, and the EU OSS scheme if you sell to consumers
   in other EU countries (your accountant registers you for OSS). Stripe only charges VAT where
   you're registered.
3. Stripe → **Settings → Customer emails**: turn on receipts for successful payments.
4. Switch Stripe to **live mode** and repeat: live secret key → Supabase `STRIPE_SECRET_KEY`;
   a live webhook endpoint (same URL and events) → its signing secret → `STRIPE_WEBHOOK_SECRET`;
   save the live customer portal settings; set up Tax in live mode too.
5. Buy Premium once with your own card on the live site, check it switches on, then refund
   yourself from the Stripe dashboard.

Customers created in test mode don't carry over to live mode; the app creates new ones
automatically.

## Ask your accountant about

- Charging and reporting VAT (OSS) for EU customers, and whether prices should include it.
- Italian e-invoicing (fattura elettronica / corrispettivi): Stripe receipts and invoices are
  not sent through the SDI.
- Pricing in euros instead of dollars, if most customers are in Europe.
