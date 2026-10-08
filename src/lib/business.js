// The business details live in one file shared with the Edge Functions (so emails show the
// same name and address as the website). Edit them there.
import { BUSINESS, LEGAL_UPDATED } from '../../supabase/functions/_shared/business.js';

export { BUSINESS, LEGAL_UPDATED };

// Shown in place of anything not filled in yet, so a gap is obvious rather than silent
export const detail = (key) => BUSINESS[key] || `[${{ name: 'business name', address: 'address', vatNumber: 'VAT number', email: 'support email' }[key] ?? key}]`;
