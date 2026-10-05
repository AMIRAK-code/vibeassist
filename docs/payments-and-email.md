# Turning on payments and email

VibeAssist's code for both is in place and deployed. Each needs an account of your own and a
few values pasted into dashboards; nothing here can be done for you from the code.

## Payments (Stripe)

Premium is sold through Stripe Checkout. Two Edge Functions do the work:

- `billing` opens Checkout and Stripe's billing portal for the signed-in user, and re-checks a
  subscription with Stripe on demand (for example right after paying).
- `stripe-webhook` receives Stripe's events (new subscription, renewal, failed payment,
  cancellation) and updates the user's plan. It only accepts requests signed by Stripe.

Until the keys below are added, the plans page says Premium can't be bought yet and nothing can
be charged.

### 1. Start in test mode

1. In the Stripe dashboard, switch on **Test mode** and open **Developers → API keys**. Copy the
   **Secret key** (`sk_test_…`).
2. In Supabase, open **Edge Functions → Secrets** and add `STRIPE_SECRET_KEY` with that value.
3. In Stripe, add a webhook endpoint (**Developers → Webhooks → Add endpoint**):
   - URL: `https://thwxxgibcbxkfodzoedb.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`,
     `invoice.payment_failed`
4. Copy the endpoint's **Signing secret** (`whsec_…`) and add it in Supabase as
   `STRIPE_WEBHOOK_SECRET`.
5. In Stripe, open **Settings → Billing → Customer portal** and press **Save** once. Allow
   cancelling, updating the payment method and viewing invoices. (Stripe refuses to open the
   portal in test mode until these settings have been saved.)

### 2. Try it

1. Sign in. If your account still has the old free demo Premium, switch it to Free in
   **Settings → Plan** first.
2. Open **Plans**, choose monthly or yearly and press **Continue to checkout**.
3. Pay with card `4242 4242 4242 4242`, any future expiry date and any CVC.
4. You land on **Premium is on**. **Settings → Plan** shows when it renews.
5. Press **Manage billing**, cancel, and come back: Settings says Premium stays on until the
   end of the period, and the webhook switches it to Free when that period ends.

The first checkout creates the product **VibeAssist Premium** in Stripe with two prices:
$9.99 a month (lookup key `vibeassist_premium_monthly`) and $59.88 a year, half the monthly
price (`vibeassist_premium_yearly`). To change a price, edit `PREMIUM_PRICES` in
`supabase/functions/_shared/stripe.ts` and the amounts on the plans page, then redeploy the
billing function. The next checkout creates the new price, moves the lookup key to it and
archives the old one. Existing subscribers keep the price they signed up at.

Promo codes created in Stripe (**Products → Coupons → Promotion codes**) can be entered at
checkout.

### 3. Going live

1. Repeat steps 1–5 above with Test mode switched off: live secret key, a live webhook endpoint
   and its own signing secret, and the live customer portal settings.
2. Add `SITE_URL` in Supabase secrets with the app's public address
   (for example `https://app.example.com`) so Stripe sends people back to it after checkout.
3. Check tax before charging real customers. Prices are charged as shown, without VAT or sales
   tax added. Selling to consumers in the EU usually means collecting VAT; Stripe Tax can do
   that, but it needs to be switched on in Stripe and in the checkout code.

Customers created in test mode don't exist in live mode; the app notices and creates new ones.

## Email (Supabase Auth)

Sign-up confirmations and password reset links are sent by Supabase Auth. Out of the box,
Supabase's own sender **only delivers to members of your Supabase organisation**, and only a few
emails an hour. Anyone else who signs up gets "We can't send email to this address yet" and can't
confirm their account. Fix this by connecting your own email provider.

### 1. Connect a sender

Any SMTP provider works (Resend, Postmark, Amazon SES, SendGrid, Brevo…). With Resend:

1. Create an account at resend.com and add your domain. Add the DNS records it shows and wait
   until the domain is verified. Without a verified domain, Resend only delivers to your own
   address.
2. Create an API key with sending access.
3. In Supabase, open **Authentication → Emails → SMTP Settings**, turn on custom SMTP and enter:
   - Host `smtp.resend.com`, port `465`
   - Username `resend`, password: the API key
   - Sender email: an address on your verified domain, such as `hello@yourdomain.com`
   - Sender name: `VibeAssist`
4. Open **Authentication → Rate Limits** and raise the emails-per-hour limit to fit the sign-ups
   you expect.

### 2. Point links at the app

In **Authentication → URL Configuration**:

- **Site URL**: the app's public address (`http://localhost:5173` while developing).
- **Redirect URLs**: add `http://localhost:5173/**` and your public address followed by `/**`.

Confirmation links open `/dashboard` and reset links open `/reset-password`. If a link has
expired or was already used, the app explains that on the sign-in page and offers a new one.

### 3. Optional

- **Authentication → Emails → Templates**: reword the *Confirm signup* and *Reset password*
  emails. Keep `{{ .ConfirmationURL }}` in each.
- **Leaked password protection** (in the password settings, on Supabase plans that include it)
  rejects passwords known from data breaches.

### Try it

Sign up with an address that is **not** in your Supabase organisation. The confirmation email
should arrive within a minute; on the "Check your inbox" screen, **Resend email** becomes
available after 60 seconds.
