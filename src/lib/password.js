// Shared by sign-up and password reset. Returns an error message, or '' when valid.
export function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/\d/.test(password)) return 'Password must contain at least one number.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  return '';
}

export const PASSWORD_HINT = 'Must be 8+ characters, contain 1 number and 1 uppercase letter.';

const PWNED_RANGE = 'https://api.pwnedpasswords.com/range/';

// How often a password appears in HaveIBeenPwned's list of leaked passwords. Only the first 5
// characters of its SHA-1 hash leave the browser; the service answers with every hash sharing
// that prefix and the match happens here. Null when the check couldn't run.
export async function timesLeaked(password, { fetchFn = fetch, timeoutMs = 4000 } = {}) {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const res = await fetchFn(`${PWNED_RANGE}${hash.slice(0, 5)}`, {
      // Padding hides how many real matches the prefix has; padded entries have a count of 0
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const suffix = hash.slice(5);
    for (const line of (await res.text()).split('\n')) {
      const [candidate, count] = line.trim().split(':');
      if (candidate === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

// The leaked-password check for a form: an error message, or '' to carry on. If the service
// can't be reached the password is allowed, so an outage never locks anyone out.
export async function leakedPasswordError(password, options) {
  const count = await timesLeaked(password, options);
  return count > 0
    ? 'This password appears in lists of leaked passwords, so attackers try it early. Choose a different one.'
    : '';
}
