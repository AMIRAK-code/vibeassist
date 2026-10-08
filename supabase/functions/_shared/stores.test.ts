import { afterEach, describe, expect, it, vi } from 'vitest';
import { daysBetween, decodeText, gunzip, mapLimit, parseDelimited, signJwt, StoreError, unzipEntries } from './reports.ts';
import { convert, parseEcbXml } from './fx.ts';
import { appStoreToken, explainAppleError, fetchSalesDay, parseSalesSummary, salesReportUrl } from './appstore.ts';
import {
  explainGoogleError, googleAccessToken, normaliseBucket, packagesFromObjectNames, parseInstallsOverview,
  parseSalesReport, parseServiceAccount, recentMonths,
} from './googleplay.ts';

afterEach(() => vi.unstubAllGlobals());

const encoder = new TextEncoder();

async function compress(bytes: Uint8Array, format: 'gzip' | 'deflate-raw') {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function utf16le(text: string) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    bytes[2 + i * 2] = text.charCodeAt(i) & 0xff;
    bytes[3 + i * 2] = text.charCodeAt(i) >> 8;
  }
  return bytes;
}

// A minimal zip archive: one local header per file, a central directory and its end record
async function makeZip(files: { name: string; text: string; deflate?: boolean }[]) {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw = encoder.encode(file.text);
    const data = file.deflate ? await compress(raw, 'deflate-raw') : raw;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, file.deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, file.deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function pkcs8Pem(key: CryptoKey) {
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', key));
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----\n`;
}

const fromBase64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const decodePart = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64url(part)));

describe('report helpers', () => {
  it('unzips stored and deflated files and gunzips', async () => {
    const zip = await makeZip([{ name: 'a.csv', text: 'x,y\n1,2' }, { name: 'b.csv', text: 'hello '.repeat(50), deflate: true }]);
    const entries = await unzipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual(['a.csv', 'b.csv']);
    expect(new TextDecoder().decode(entries[1].data)).toBe('hello '.repeat(50));
    expect(new TextDecoder().decode(await gunzip(await compress(encoder.encode('zipped'), 'gzip')))).toBe('zipped');
    await expect(unzipEntries(encoder.encode('not a zip at all, definitely not'))).rejects.toThrow('Not a zip file');
  });

  it('decodes UTF-16 reports and parses quoted CSV and TSV', () => {
    expect(decodeText(utf16le('Date,Installs'))).toBe('Date,Installs');
    expect(parseDelimited('Name,Note\r\n"A, B","say ""hi"""\r\n', ',')).toEqual([{ Name: 'A, B', Note: 'say "hi"' }]);
    expect(parseDelimited('a\tb\n1\t2\n', '\t')).toEqual([{ a: '1', b: '2' }]);
  });

  it('signs ES256 and RS256 tokens that verify with the public key', async () => {
    for (const [alg, params, verify] of [
      ['ES256', { name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' }],
      ['RS256', { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, { name: 'RSASSA-PKCS1-v1_5' }],
    ] as const) {
      const pair = await crypto.subtle.generateKey(params, true, ['sign', 'verify']) as CryptoKeyPair;
      const token = await signJwt(alg, await pkcs8Pem(pair.privateKey), { kid: 'K1' }, { sub: 'me' });
      const [header, payload, signature] = token.split('.');
      expect(decodePart(header)).toEqual({ kid: 'K1', alg, typ: 'JWT' });
      expect(decodePart(payload)).toEqual({ sub: 'me' });
      expect(await crypto.subtle.verify(verify, pair.publicKey, fromBase64url(signature), encoder.encode(`${header}.${payload}`))).toBe(true);
    }
  });

  it('stops starting work after the deadline and keeps failures separate', async () => {
    const results = await mapLimit([1, 2, 3], 1, async (n) => {
      if (n === 2) throw new Error('boom');
      return n * 10;
    });
    expect(results[0]).toEqual({ ok: true, value: 10 });
    expect(results[1].ok).toBe(false);
    expect(await mapLimit([1], 2, async () => 1, Date.now() - 1)).toEqual([{ ok: false, skipped: true }]);
    expect(daysBetween('2026-09-29', '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  });
});

describe('exchange rates', () => {
  const xml = `<gesmes:Envelope><Cube>
    <Cube time="2026-10-02"><Cube currency="USD" rate="1.10"/><Cube currency="GBP" rate="0.85"/></Cube>
    <Cube time="2026-10-01"><Cube currency="USD" rate="1.00"/></Cube>
  </Cube></gesmes:Envelope>`;

  it('converts through the euro, using the last working day before weekends', () => {
    const rates = parseEcbXml(xml);
    expect(convert(110, 'USD', 'EUR', '2026-10-02', rates)).toBeCloseTo(100);
    expect(convert(110, 'USD', 'GBP', '2026-10-04', rates)).toBeCloseTo(85); // Sunday uses Friday
    expect(convert(10, 'USD', 'EUR', '2026-09-01', rates)).toBeCloseTo(10); // older than the history
    expect(convert(5, 'EGP', 'EUR', '2026-10-02', rates)).toBeNull();
    expect(convert(7, 'USD', 'USD', '2026-10-02', new Map())).toBe(7);
  });
});

describe('App Store Connect', () => {
  const tsv = [
    'Provider\tProduct Type Identifier\tUnits\tDeveloper Proceeds\tBegin Date\tCurrency of Proceeds',
    'APPLE\t1F\t10\t0\t10/01/2026\tUSD',
    'APPLE\t1\t2\t0.70\t10/01/2026\tUSD',
    'APPLE\t7\t40\t0\t10/01/2026\tUSD',
    'APPLE\t3\t5\t0\t10/01/2026\tUSD',
    'APPLE\tIAY\t3\t3.49\t10/01/2026\tEUR',
    'APPLE\tIA1\t-1\t3.49\t10/01/2026\tEUR',
    'APPLE\tZZ9\t1\t1\t10/01/2026\tUSD',
  ].join('\n');

  it('counts downloads and purchases and adds proceeds per currency', () => {
    const { days, unknownTypes } = parseSalesSummary(tsv);
    const day = days.get('2026-10-01')!;
    expect(day.downloads).toBe(12);
    expect(day.purchases).toBe(5); // 2 paid downloads + 3 subscriptions; the refund isn't a purchase
    expect(day.proceeds.get('USD')).toBeCloseTo(1.4);
    expect(day.proceeds.get('EUR')).toBeCloseTo(3 * 3.49 - 3.49);
    expect([...unknownTypes]).toEqual(['ZZ9']);
  });

  it('asks for the daily summary report and reads the gzipped answer', async () => {
    const url = salesReportUrl('85000000', '2026-10-01');
    expect(url.searchParams.get('filter[reportType]')).toBe('SALES');
    expect(url.searchParams.get('filter[reportDate]')).toBe('2026-10-01');
    const gz = await compress(encoder.encode(tsv), 'gzip');
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(gz, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ code: 'NOT_FOUND' }] }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ code: 'NOT_AUTHORIZED', detail: 'nope' }] }), { status: 401 }));
    expect(await fetchSalesDay('t', '85000000', '2026-10-01', fetchFn)).toBe(tsv);
    expect(await fetchSalesDay('t', '85000000', '2026-10-02', fetchFn)).toBeNull();
    const failure = await fetchSalesDay('t', '85000000', '2026-10-03', fetchFn).catch((e) => e);
    expect(failure).toBeInstanceOf(StoreError);
    expect(explainAppleError(failure)).toMatch(/Issuer ID/);
  });

  it('builds a token Apple accepts: kid header, issuer, audience, under 20 minutes', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const token = await appStoreToken({ issuerId: 'issuer-1', keyId: 'ABC123DEFG', privateKey: await pkcs8Pem(pair.privateKey) }, 1000);
    const [header, payload] = token.split('.').map((p, i) => (i < 2 ? decodePart(p) : p));
    expect(header).toMatchObject({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(payload).toEqual({ iss: 'issuer-1', iat: 1000, exp: 1000 + 19 * 60, aud: 'appstoreconnect-v1' });
  });
});

describe('Google Play', () => {
  it('keeps only the parts of the key file needed to sign in', () => {
    const account = parseServiceAccount(JSON.stringify({ type: 'service_account', client_email: 'a@b.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----', project_id: 'p' }));
    expect(account).toEqual({ client_email: 'a@b.iam.gserviceaccount.com', private_key: expect.stringContaining('PRIVATE KEY'), token_uri: 'https://oauth2.googleapis.com/token' });
    expect(() => parseServiceAccount('{}')).toThrow(/service account key/);
    expect(() => parseServiceAccount('not json')).toThrow(/not a service account key/);
    expect(normaliseBucket(' gs://pubsite_prod_rev_123/stats ')).toBe('pubsite_prod_rev_123');
  });

  it('exchanges a signed assertion for an access token', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'ya29.token' })));
    const token = await googleAccessToken({ client_email: 'sa@x', private_key: await pkcs8Pem(pair.privateKey), token_uri: 'https://oauth2.googleapis.com/token' }, 50, fetchFn);
    expect(token).toBe('ya29.token');
    const body = new URLSearchParams(fetchFn.mock.calls[0][1].body);
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(decodePart(body.get('assertion')!.split('.')[1])).toMatchObject({ iss: 'sa@x', scope: 'https://www.googleapis.com/auth/devstorage.read_only', iat: 50 });
  });

  it('reads installs from the UTF-16 overview, preferring daily user installs', () => {
    const csv = 'Date,Package Name,Daily User Installs,Install events\n2026-10-01,com.app,12,15\n2026-10-02,com.app,,4\n';
    const { days, column } = parseInstallsOverview(utf16le(csv));
    expect(column).toBe('Daily User Installs');
    expect(days.get('2026-10-01')).toBe(12);
    expect(parseInstallsOverview(utf16le('Date,Install events\n2026-10-01,7\n')).days.get('2026-10-01')).toBe(7);
    expect(packagesFromObjectNames(['stats/installs/installs_com.app_202610_overview.csv', 'stats/installs/installs_com.app_202610_country.csv', 'sales/x.zip'])).toEqual(['com.app']);
  });

  it('adds up charged orders by day and subtracts refunds', async () => {
    const csv = [
      'Order Number,Order Charged Date,Financial Status,Product ID,Currency of Sale,Item Price',
      'GPA.1,2026-10-01,Charged,com.app,EUR,"1,299.00"',
      'GPA.2,2026-10-01,Charged,com.app,EUR,4.99',
      'GPA.3,2026-10-01,Refund,com.app,EUR,-4.99',
      'GPA.4,2026-10-01,Charged,com.other,EUR,99',
      'GPA.5,2026-10-01,Cancelled,com.app,EUR,4.99',
    ].join('\n');
    const days = await parseSalesReport(await makeZip([{ name: 'salesreport_202610.csv', text: csv, deflate: true }]), ['com.app']);
    const day = days.get('2026-10-01')!;
    expect(day.purchases).toBe(2);
    expect(day.sales.get('EUR')).toBeCloseTo(1299 + 4.99 - 4.99);
  });

  it('lists the months to read and explains errors', () => {
    expect(recentMonths(2, new Date(Date.UTC(2026, 0, 15)))).toEqual(['202512', '202601']);
    expect(explainGoogleError(new StoreError(403, '', 'denied'))).toMatch(/24 hours/);
    expect(explainGoogleError(new StoreError(400, 'invalid_grant', 'x'))).toMatch(/deleted/);
  });
});
