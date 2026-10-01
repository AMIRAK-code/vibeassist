import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

const columns = [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value' }];

describe('toCsv', () => {
  it('quotes commas, quotes and line breaks', () => {
    const csv = toCsv(columns, [{ name: 'Launch, week 1', value: 'say "hi"\nnow' }]);
    expect(csv.split('\r\n')[1]).toBe('"Launch, week 1","say ""hi""\nnow"');
  });

  it('neutralises spreadsheet formulas in text but keeps negative numbers', () => {
    const csv = toCsv(columns, [
      { name: '=HYPERLINK("http://evil")', value: -12.5 },
      { name: '+cmd', value: '-3' },
    ]);
    const [, first, second] = csv.split('\r\n');
    expect(first.startsWith(`"'=HYPERLINK`)).toBe(true);
    expect(first.endsWith(',-12.5')).toBe(true);
    expect(second).toBe("'+cmd,-3");
  });

  it('writes empty cells for missing values', () => {
    expect(toCsv(columns, [{ name: 'x', value: null }]).split('\r\n')[1]).toBe('x,');
  });
});
