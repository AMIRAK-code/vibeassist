import { describe, expect, it } from 'vitest';
import { authMessage, parseAuthLinkError } from './authErrors';

describe('authMessage', () => {
  it('explains the default mail sender refusing an address', () => {
    expect(authMessage({ code: 'email_address_not_authorized', message: 'Email address not authorized' })).toMatch(/can't send email to this address/);
  });

  it('explains rate limits and delivery failures without a code', () => {
    expect(authMessage({ code: 'over_email_send_rate_limit' })).toMatch(/Wait a minute/);
    expect(authMessage({ message: 'Error sending confirmation email' })).toMatch(/couldn't send the email/);
  });

  it('keeps the details of a weak password and falls back to the message', () => {
    expect(authMessage({ code: 'weak_password', message: 'Password should contain a number.' })).toBe('Choose a stronger password. Password should contain a number.');
    expect(authMessage({ code: 'something_new', message: 'Odd thing happened.' })).toBe('Odd thing happened.');
    expect(authMessage(null, 'Fallback.')).toBe('Fallback.');
  });
});

describe('parseAuthLinkError', () => {
  it('reads an expired confirmation link from the hash', () => {
    expect(parseAuthLinkError({
      pathname: '/dashboard',
      search: '',
      hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    })).toEqual({ code: 'otp_expired', description: 'Email link is invalid or has expired', kind: 'signup' });
  });

  it('reads the query string too, and knows a reset link by its page', () => {
    expect(parseAuthLinkError({ pathname: '/reset-password', search: '?error_code=otp_expired', hash: '' })?.kind).toBe('reset');
  });

  it('ignores normal URLs, including successful sign-in links', () => {
    expect(parseAuthLinkError({ pathname: '/dashboard', search: '?from=x', hash: '#access_token=abc&type=signup' })).toBeNull();
  });
});
