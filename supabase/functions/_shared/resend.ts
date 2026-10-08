// Sending email through Resend's HTTP API (RESEND_API_KEY, a "sending access" key).

export type Email = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  reply_to?: string;
};

export class ResendError extends Error {
  constructor(public status: number, public name: string, message: string) {
    super(message);
  }
}

async function post(apiKey: string, path: string, body: unknown, idempotencyKey: string | undefined, fetchFn: typeof fetch) {
  const res = await fetchFn(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ResendError(res.status, data?.name ?? '', data?.message ?? `Resend returned ${res.status}`);
  return data;
}

export async function sendEmail(apiKey: string, email: Email, fetchFn: typeof fetch = fetch): Promise<string> {
  const data = await post(apiKey, '/emails', email, undefined, fetchFn);
  return data.id;
}

// Up to 100 emails in one request. Sending the same key again within 24 hours returns the
// first result instead of delivering twice.
export async function sendBatch(apiKey: string, emails: Email[], idempotencyKey: string, fetchFn: typeof fetch = fetch): Promise<string[]> {
  if (emails.length > 100) throw new Error('Resend batches hold at most 100 emails');
  const data = await post(apiKey, '/emails/batch', emails, idempotencyKey, fetchFn);
  return (data?.data ?? []).map((d: { id: string }) => d.id);
}

// Resend allows a few requests per second per team; stay under it
export const pause = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));
