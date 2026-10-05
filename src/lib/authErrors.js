// Supabase Auth errors carry codes; these are the ones people actually run into,
// worded so they know what happened and what to do next.
const MESSAGES = {
  email_address_not_authorized:
    "We can't send email to this address yet, so the account can't be confirmed. That's a problem on our side; please try again later.",
  over_email_send_rate_limit: 'Too many emails went to this address in a short time. Wait a minute, then try again.',
  over_request_rate_limit: 'Too many attempts in a short time. Wait a minute, then try again.',
  email_address_invalid: "That address can't receive email. Check it for typos.",
  user_already_exists: 'An account with this email already exists. Sign in instead, or reset your password from the sign-in page.',
  email_exists: 'An account with this email already exists. Sign in instead, or reset your password from the sign-in page.',
  signup_disabled: 'New sign-ups are paused right now. Please try again later.',
  same_password: "That's your current password. Choose a different one.",
  otp_expired: 'That link has expired or was already used. Ask for a new one below.',
  invalid_credentials: "That email and password don't match an account. Check both, or reset your password below.",
  email_not_confirmed: 'Confirm your email first: open the link we sent when you signed up. No email? Send a new one below.',
};

export function authMessage(error, fallback = 'Something went wrong. Try again in a moment.') {
  if (!error) return fallback;
  if (MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.code === 'weak_password') return `Choose a stronger password. ${error.message ?? ''}`.trim();
  // Delivery failures from the mail server don't always come with a code
  if (/sending .*email|email .*send/i.test(error.message ?? '')) {
    return "We couldn't send the email just now. Try again in a few minutes.";
  }
  return error.message ? `${error.message}` : fallback;
}

// When an emailed link has expired or was already used, Supabase sends people back with
// error details in the URL (#error_code=… or ?error_code=…). Reset links land on
// /reset-password; confirmation links land anywhere else.
export function parseAuthLinkError(location) {
  const read = (text) => new URLSearchParams(text.replace(/^[#?]/, ''));
  const hash = read(location.hash ?? '');
  const query = read(location.search ?? '');
  const params = hash.get('error_code') || hash.get('error') ? hash : query;
  const code = params.get('error_code') || params.get('error');
  if (!code) return null;
  return {
    code,
    description: params.get('error_description') ?? '',
    kind: (location.pathname ?? '').startsWith('/reset-password') ? 'reset' : 'signup',
  };
}

// Read once at startup, before the Supabase client looks at the URL. Kept here rather than in
// navigation state, because the signed-in-only routes also redirect to sign in while the
// session loads, and that redirect would replace it.
export const initialAuthLinkError = typeof window === 'undefined' ? null : parseAuthLinkError(window.location);
let pendingLinkError = initialAuthLinkError;
export const pendingAuthLinkError = () => pendingLinkError;
// Shown once: after the sign-in page has used it, later visits start clean
export const clearAuthLinkError = () => {
  pendingLinkError = null;
};

export const isValidEmail = (email) => /^\S+@\S+\.\S+$/.test(email.trim());
