import { formatCount } from './format';

// The connected sources that can be asked for fresh numbers, and the function that does it.
// The Custom API isn't here: apps push their own numbers.
export const SYNCABLE = {
  stripe: { label: 'Stripe', fn: 'stripe-sync', body: { action: 'sync' } },
  app_store: { label: 'App Store', fn: 'store-sync', body: { provider: 'app_store', action: 'sync' } },
  google_play: { label: 'Google Play', fn: 'store-sync', body: { provider: 'google_play', action: 'sync' } },
};

const plural = (n, one, many) => `${formatCount(n)} ${n === 1 ? one : many}`;

// One short line about what a sync brought in
export function describeSync(provider, data) {
  if (provider === 'stripe') return `${plural(data.transactions, 'transaction', 'transactions')} across ${plural(data.days, 'day', 'days')}`;
  const parts = [`${plural(data.days, 'day', 'days')} checked`, plural(data.downloads, 'download', 'downloads'), plural(data.purchases, 'purchase', 'purchases')];
  let text = parts.join(', ');
  if (data.skippedCurrencies?.length) text += `. Not converted: ${data.skippedCurrencies.join(', ')}`;
  if (data.partial) text += '. Some days could not be read; sync again to fill them in';
  return text;
}

// Syncs every connected source at once. `call(fn, body)` is callFunction; one failing source
// never stops the others.
export async function syncAllConnected(connections, call) {
  const targets = connections.filter((c) => c.status === 'connected' && SYNCABLE[c.provider]);
  const settled = await Promise.allSettled(targets.map((c) => call(SYNCABLE[c.provider].fn, SYNCABLE[c.provider].body)));
  return settled.map((result, i) => {
    const { provider } = targets[i];
    const label = SYNCABLE[provider].label;
    if (result.status === 'rejected' || result.value.status !== 200) {
      const error = result.status === 'fulfilled' ? result.value.data?.error : null;
      return { provider, ok: false, text: `${label}: ${error ?? 'sync failed'}` };
    }
    return { provider, ok: !result.value.data?.partial, text: `${label}: ${describeSync(provider, result.value.data)}` };
  });
}

// Reads a small key file the user picked (.p8 or service-account JSON). It's held in memory,
// sent once to connect, and never saved in the browser.
export async function readKeyFile(file, maxBytes = 64 * 1024) {
  if (file.size > maxBytes) throw new Error('That file is too big to be a key file. Pick the .p8 or .json key you downloaded.');
  return file.text();
}
