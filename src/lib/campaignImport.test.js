import { describe, expect, it } from 'vitest';
import { parseCsv, parseNumber } from './csv';
import { buildImport, guessMapping, parseStatus, planImport } from './campaignImport';

describe('parseCsv', () => {
  it('reads quoted fields, a byte-order mark and Windows line endings', () => {
    const { headers, rows } = parseCsv('﻿Campaign name,Amount spent (USD)\r\n"Launch, week 1",12.50\r\n"Say ""hi""\nagain",3\r\n');
    expect(headers).toEqual(['Campaign name', 'Amount spent (USD)']);
    expect(rows).toEqual([['Launch, week 1', '12.50'], ['Say "hi"\nagain', '3']]);
  });

  it('detects semicolon and tab separated files and skips blank lines', () => {
    expect(parseCsv('Campaign;Cost\nA;1,50\n\n').rows).toEqual([['A', '1,50']]);
    expect(parseCsv('Campaign\tCost\nA\t2').rows).toEqual([['A', '2']]);
  });
});

describe('parseNumber', () => {
  it('understands the number formats ad networks export', () => {
    expect(parseNumber('$1,234.50')).toBe(1234.5);
    expect(parseNumber('1.234,50 €')).toBe(1234.5);
    expect(parseNumber('1 234')).toBe(1234);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('(12.00)')).toBe(-12);
    expect(parseNumber('--')).toBeNull();
    expect(parseNumber('n/a')).toBeNull();
  });
});

describe('guessMapping', () => {
  it('maps Meta and Google Ads report columns', () => {
    expect(guessMapping(['Campaign name', 'Campaign delivery', 'Amount spent (USD)', 'App installs', 'Purchases conversion value']))
      .toEqual({ name: 0, status: 1, spend: 2, installs: 3, revenue: 4 });
    expect(guessMapping(['Campaign', 'Campaign status', 'Cost', 'Installs', 'Conv. value']))
      .toEqual({ name: 0, status: 1, spend: 2, installs: 3, revenue: 4 });
    expect(guessMapping(['Day', 'Impressions'])).toEqual({ name: null, spend: null, installs: null, revenue: null, status: null });
  });
});

describe('buildImport', () => {
  const mapping = { name: 0, spend: 1, installs: 2, revenue: 3, status: 4 };

  it('adds up repeated campaigns, skips total rows and reports bad rows', () => {
    const { items, problems } = buildImport([
      ['Launch', '10.10', '5', '20', 'Active'],
      ['launch', '0.20', '1', '0', ''],
      ['Total', '999', '999', '999', ''],
      ['Refund', '-5', '0', '0', 'Paused'],
      ['', '1', '1', '1', ''],
    ], mapping);
    expect(items).toEqual([{ name: 'Launch', spend: 10.3, installs: 6, revenue: 20, status: 'active' }]);
    expect(problems).toEqual([{ row: 5, reason: 'Negative number for “Refund”' }]);
  });

  it('leaves out columns the user did not map', () => {
    const { items } = buildImport([['A', '3']], { name: 0, spend: 1, installs: null, revenue: null, status: null });
    expect(items).toEqual([{ name: 'A', spend: 3, installs: null, revenue: null, status: null }]);
  });
});

describe('planImport', () => {
  const existing = [
    { id: '1', network: 'meta', name: 'Launch', spend: 1, revenue: 2, installs: 3, status: 'active' },
    { id: '2', network: 'meta', name: 'Dup', spend: 0, revenue: 0, installs: 0, status: 'active' },
    { id: '3', network: 'meta', name: 'dup ', spend: 0, revenue: 0, installs: 0, status: 'active' },
    { id: '4', network: 'google', name: 'New one', spend: 0, revenue: 0, installs: 0, status: 'active' },
  ];

  it('updates matches on the same network, adds new names and skips ambiguous ones', () => {
    const plan = planImport(existing, 'meta', [
      { name: 'launch', spend: 9, revenue: null, installs: 4, status: 'paused' },
      { name: 'Dup', spend: 1, revenue: 1, installs: 1, status: null },
      { name: 'New one', spend: 2, revenue: null, installs: null, status: null },
    ]);
    expect(plan.updates).toEqual([{ id: '1', name: 'Launch', before: existing[0], values: { spend: 9, installs: 4, status: 'paused' } }]);
    expect(plan.ambiguous).toEqual(['Dup']);
    expect(plan.inserts).toEqual([{ network: 'meta', name: 'New one', status: 'active', spend: 2, revenue: 0, installs: 0 }]);
  });

  it('reads common status words', () => {
    expect(parseStatus('Enabled')).toBe('active');
    expect(parseStatus('not delivering')).toBe('paused');
    expect(parseStatus('Removed')).toBe('ended');
    expect(parseStatus('Learning limited')).toBeNull();
  });
});
