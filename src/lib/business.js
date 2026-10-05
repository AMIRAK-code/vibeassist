// The business behind VibeAssist. Fill these in before taking real payments: they appear on
// the Terms, Privacy and Refunds pages and in the site footer, and Stripe and Italian law
// (P.IVA on the website) expect them to be public.
export const BUSINESS = {
  name: '', // legal name: your full name if you sell as a sole trader, or the company name
  address: '', // registered address
  vatNumber: '', // Partita IVA
  email: '', // support address customers can write to, e.g. support@assist365.app
  country: 'Italy',
  site: 'https://vibeassist.assist365.app',
};

export const LEGAL_UPDATED = 'October 2026';

// Shown in place of anything not filled in yet, so a gap is obvious rather than silent
export const detail = (key) => BUSINESS[key] || `[${{ name: 'business name', address: 'address', vatNumber: 'VAT number', email: 'support email' }[key] ?? key}]`;
