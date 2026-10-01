// Shared by sign-up and password reset. Returns an error message, or '' when valid.
export function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/\d/.test(password)) return 'Password must contain at least one number.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  return '';
}

export const PASSWORD_HINT = 'Must be 8+ characters, contain 1 number and 1 uppercase letter.';
