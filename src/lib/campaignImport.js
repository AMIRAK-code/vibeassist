import { parseNumber } from './csv';

// Column names used by each network's campaign report export, most specific first.
// The guess is only a starting point: the user confirms every column before importing.
export const IMPORT_FIELDS = [
  { key: 'name', label: 'Campaign name', required: true, synonyms: ['campaign name', 'campaign'] },
  { key: 'spend', label: 'Spend', required: true, synonyms: ['amount spent', 'total spend', 'spend', 'cost', 'total cost'] },
  { key: 'installs', label: 'Installs', synonyms: ['app installs', 'mobile app installs', 'installs', 'total installs', 'tap-through installs', 'app install', 'install'] },
  { key: 'revenue', label: 'Revenue', synonyms: ['purchase conversion value', 'purchases conversion value', 'total purchase value', 'conv. value', 'conversion value', 'all conv. value', 'revenue', 'total revenue', 'purchase value'] },
  { key: 'status', label: 'Status', synonyms: ['campaign status', 'campaign delivery', 'delivery', 'status'] },
];

// "Amount spent (USD)" -> "amount spent"
const normalise = (header) => header.toLowerCase().replace(/\(.*?\)/g, '').replace(/[_\s]+/g, ' ').trim();

export function guessMapping(headers) {
  const names = headers.map(normalise);
  const used = new Set();
  const mapping = {};
  for (const field of IMPORT_FIELDS) {
    mapping[field.key] = null;
    for (const synonym of field.synonyms) {
      const index = names.findIndex((name, i) => !used.has(i) && name === synonym);
      if (index > -1) {
        mapping[field.key] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

const STATUS_WORDS = {
  active: ['active', 'enabled', 'eligible', 'running', 'on', 'delivering', 'learning'],
  paused: ['paused', 'disabled', 'off', 'inactive', 'not delivering', 'campaign paused', 'on hold'],
  ended: ['ended', 'completed', 'removed', 'archived', 'deleted', 'finished'],
};

export function parseStatus(value) {
  const text = String(value ?? '').toLowerCase().trim();
  if (!text) return null;
  for (const [status, words] of Object.entries(STATUS_WORDS)) {
    if (words.includes(text)) return status;
  }
  return null;
}

const isTotalRow = (name) => /^(total|totals|grand total|summary)\b/i.test(name);

// Turns report rows into one entry per campaign. Daily or per-ad-set exports list a campaign
// several times, so its rows are added up. Rows that can't be read are reported, not guessed.
export function buildImport(rows, mapping) {
  const byName = new Map();
  const problems = [];
  rows.forEach((row, index) => {
    const name = String(row[mapping.name] ?? '').trim();
    if (!name || isTotalRow(name)) return;
    if (name.length > 120) {
      problems.push({ row: index + 2, reason: 'Campaign name is longer than 120 characters' });
      return;
    }
    const spend = parseNumber(row[mapping.spend]) ?? 0;
    const revenue = mapping.revenue === null ? null : parseNumber(row[mapping.revenue]) ?? 0;
    const installs = mapping.installs === null ? null : parseNumber(row[mapping.installs]) ?? 0;
    if (spend < 0 || (revenue ?? 0) < 0 || (installs ?? 0) < 0) {
      problems.push({ row: index + 2, reason: `Negative number for “${name}”` });
      return;
    }
    const key = name.toLowerCase();
    const entry = byName.get(key) ?? { name, spend: 0, revenue: mapping.revenue === null ? null : 0, installs: mapping.installs === null ? null : 0, status: null };
    entry.spend += spend;
    if (revenue !== null) entry.revenue += revenue;
    if (installs !== null) entry.installs += Math.round(installs);
    entry.status = entry.status ?? (mapping.status === null ? null : parseStatus(row[mapping.status]));
    byName.set(key, entry);
  });
  const items = [...byName.values()].map((item) => ({
    ...item,
    spend: Math.round(item.spend * 100) / 100,
    revenue: item.revenue === null ? null : Math.round(item.revenue * 100) / 100,
  }));
  return { items, problems };
}

// Matches report entries to campaigns already tracked for this network by name (ignoring case).
// Matches are updated with the report's totals; new names are added; names that match more than
// one existing campaign are skipped so nothing is overwritten by guesswork.
export function planImport(existing, network, items) {
  const sameNetwork = existing.filter((c) => c.network === network);
  const updates = [];
  const inserts = [];
  const ambiguous = [];
  for (const item of items) {
    const matches = sameNetwork.filter((c) => c.name.trim().toLowerCase() === item.name.toLowerCase());
    const values = { spend: item.spend };
    if (item.revenue !== null) values.revenue = item.revenue;
    if (item.installs !== null) values.installs = item.installs;
    if (item.status) values.status = item.status;
    if (matches.length > 1) ambiguous.push(item.name);
    else if (matches.length === 1) updates.push({ id: matches[0].id, name: matches[0].name, before: matches[0], values });
    else inserts.push({ network, name: item.name, status: item.status ?? 'active', spend: item.spend, revenue: item.revenue ?? 0, installs: item.installs ?? 0 });
  }
  return { updates, inserts, ambiguous };
}
