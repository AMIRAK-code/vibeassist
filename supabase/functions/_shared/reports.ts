// Small helpers for reading store reports and signing API tokens. Built only on web APIs
// (fetch, Web Crypto, DecompressionStream, TextDecoder) so the same code runs in the Edge
// Functions (Deno) and in the vitest suite (Node).

async function pipeThrough(bytes: Uint8Array, format: 'gzip' | 'deflate-raw'): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const gunzip = (bytes: Uint8Array) => pipeThrough(bytes, 'gzip');

// Reads every file in a .zip archive (stored or deflated entries, which is what Google uses)
export async function unzipEntries(bytes: Uint8Array): Promise<{ name: string; data: Uint8Array }[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Not a zip file');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries: { name: string; data: Uint8Array }[] = [];
  const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Damaged zip directory');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue; // folder
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);
    if (method === 0) entries.push({ name, data: raw });
    else if (method === 8) entries.push({ name, data: await pipeThrough(raw, 'deflate-raw') });
    else throw new Error(`Unsupported zip compression (${method})`);
  }
  return entries;
}

// Google writes UTF-16 reports; everything else is UTF-8. The byte-order mark tells them apart.
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  return new TextDecoder().decode(bytes);
}

// A CSV or TSV file as one object per row, keyed by the header names
export function parseDelimited(text: string, separator: ',' | '\t'): Record<string, string>[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === separator) {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }
  const [headers = [], ...rows] = records.filter((r) => r.some((cell) => cell.trim() !== ''));
  const names = headers.map((h) => h.trim());
  return rows.map((row) => Object.fromEntries(names.map((name, i) => [name, (row[i] ?? '').trim()])));
}

export function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Signs a JWT with a PKCS#8 private key: ES256 for Apple, RS256 for Google service accounts.
// Web Crypto returns ECDSA signatures as raw r||s, which is exactly what JWT expects.
export async function signJwt(alg: 'ES256' | 'RS256', privateKeyPem: string, header: Record<string, unknown>, payload: Record<string, unknown>) {
  const algorithm = alg === 'ES256'
    ? { import: { name: 'ECDSA', namedCurve: 'P-256' }, sign: { name: 'ECDSA', hash: 'SHA-256' } }
    : { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, sign: { name: 'RSASSA-PKCS1-v1_5' } };
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(privateKeyPem), algorithm.import, false, ['sign']);
  const signingInput = `${base64url(JSON.stringify({ ...header, alg, typ: 'JWT' }))}.${base64url(JSON.stringify(payload))}`;
  const signature = new Uint8Array(await crypto.subtle.sign(algorithm.sign, key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${base64url(signature)}`;
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown } | { ok: false; skipped: true };

// Runs fn over items, at most `limit` at a time. Items not started before the deadline are
// marked skipped, so a slow store can never push the function past its time limit.
export async function mapLimit<I, T>(items: I[], limit: number, fn: (item: I) => Promise<T>, deadline = Infinity): Promise<Settled<T>[]> {
  const results: Settled<T>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      if (Date.now() > deadline) {
        results[index] = { ok: false, skipped: true };
        continue;
      }
      try {
        results[index] = { ok: true, value: await fn(items[index]) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export class StoreError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// ISO days from `from` to `to`, inclusive
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 864e5)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
