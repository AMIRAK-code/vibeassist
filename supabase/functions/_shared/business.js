// The business behind VibeAssist. Fill these in before taking real payments or sending the
// Weekly Vibe: they appear on the Terms, Privacy and Refunds pages, in the site footer and at
// the bottom of every email, and Stripe and Italian law (P.IVA on the website) expect them to
// be public. Shared by the web app (src/lib/business.js) and the Edge Functions.
export const BUSINESS = {
  name: '', // legal name: your full name if you sell as a sole trader, or the company name
  address: '', // registered address
  vatNumber: '', // Partita IVA
  email: '', // support address customers can write to, e.g. support@assist365.app
  country: 'Italy',
  site: 'https://vibeassist.assist365.app',
};

export const LEGAL_UPDATED = 'October 2026';

// Emails must carry a real sender name and postal address before they go out
export const businessReady = (business = BUSINESS) => Boolean(business.name && business.address && business.email);
