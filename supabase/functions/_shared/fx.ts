// Daily reference exchange rates from the European Central Bank (free, no key), used to
// turn store proceeds into the currency the user picked. Store payouts use their own
// monthly rates, so these are estimates, and the app says so.

export const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';

export type Rates = Map<string, Map<string, number>>; // day -> currency -> units per 1 EUR

export function parseEcbXml(xml: string): Rates {
  const rates: Rates = new Map();
  const dayPattern = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g;
  const ratePattern = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/>/g;
  for (const [, day, inner] of xml.matchAll(dayPattern)) {
    const table = new Map<string, number>([['EUR', 1]]);
    for (const [, currency, rate] of inner.matchAll(ratePattern)) table.set(currency, Number(rate));
    rates.set(day, table);
  }
  return rates;
}

export async function fetchEcbRates(fetchFn: typeof fetch = fetch): Promise<Rates> {
  const res = await fetchFn(ECB_URL);
  if (!res.ok) throw new Error(`ECB rates returned ${res.status}`);
  return parseEcbXml(await res.text());
}

// The rate table for a day, or the closest working day before it (weekends and holidays have
// no rates). Days older than the 90-day history use the oldest table there is.
function tableFor(rates: Rates, day: string) {
  const days = [...rates.keys()].sort();
  if (!days.length) return null;
  let chosen = days[0];
  for (const d of days) {
    if (d <= day) chosen = d;
    else break;
  }
  return rates.get(chosen) ?? null;
}

// Converts an amount between currencies on a given day; null when either currency isn't covered
export function convert(amount: number, from: string, to: string, day: string, rates: Rates): number | null {
  if (from === to) return amount;
  const table = tableFor(rates, day);
  const fromRate = table?.get(from);
  const toRate = table?.get(to);
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}
