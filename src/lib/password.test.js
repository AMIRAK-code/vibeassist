import { describe, expect, it, vi } from 'vitest';
import { leakedPasswordError, timesLeaked, validatePassword } from './password';

// SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const PREFIX = '5BAA6';
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
const answer = (body, ok = true) => vi.fn(async () => ({ ok, text: async () => body }));

describe('validatePassword', () => {
  it('asks for length, a number and an uppercase letter', () => {
    expect(validatePassword('Short1')).toMatch(/8 characters/);
    expect(validatePassword('NoNumbersHere')).toMatch(/number/);
    expect(validatePassword('lowercase123')).toMatch(/uppercase/);
    expect(validatePassword('Fine-Password1')).toBe('');
  });
});

describe('timesLeaked', () => {
  it('sends only the first 5 characters of the hash, padded', async () => {
    const fetchFn = answer('');
    await timesLeaked('password', { fetchFn });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(SUFFIX);
    expect(init.headers['Add-Padding']).toBe('true');
  });

  it('finds the password among the returned hashes', async () => {
    const fetchFn = answer(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:3861493\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2`);
    expect(await timesLeaked('password', { fetchFn })).toBe(3861493);
  });

  it('is 0 when the hash is missing or only matches a padding entry', async () => {
    expect(await timesLeaked('password', { fetchFn: answer('0018A45C4D1DEF81644B54AB7F969B88D65:1') })).toBe(0);
    expect(await timesLeaked('password', { fetchFn: answer(`${SUFFIX}:0`) })).toBe(0);
  });

  it('is null when the service fails or can not be reached', async () => {
    expect(await timesLeaked('password', { fetchFn: answer('', false) })).toBeNull();
    expect(await timesLeaked('password', { fetchFn: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) })).toBeNull();
  });
});

describe('leakedPasswordError', () => {
  it('blocks leaked passwords and lets everything else through', async () => {
    expect(await leakedPasswordError('password', { fetchFn: answer(`${SUFFIX}:12`) })).toMatch(/leaked passwords/);
    expect(await leakedPasswordError('password', { fetchFn: answer('') })).toBe('');
    // An outage never locks anyone out
    expect(await leakedPasswordError('password', { fetchFn: answer('', false) })).toBe('');
  });
});
