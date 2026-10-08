// CSV export for tables the user owns. Values are quoted when needed and formulas are
// neutralised so a spreadsheet never executes text from the data.
export function toCsv(columns, rows) {
  const cell = (value) => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  return lines.join('\r\n');
}

// Reads a CSV export (Excel, Google Sheets or an ad network's report) into a header row and
// data rows. Handles a byte-order mark, quoted fields with commas or line breaks, and files
// that use semicolons or tabs instead of commas.
export function parseCsv(text) {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch) => firstLine.split(ch).length - 1;
  const delimiter = [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');

  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
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
  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ''));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows };
}

// "$1,234.50", "1.234,50 €", "1 234", "(12.00)" -> numbers; null when it isn't one
export function parseNumber(value) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim();
  if (!text || text === '-' || text === '--') return null;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(text)) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal point
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma > -1) {
    // A single comma followed by 1-2 digits is a decimal comma; otherwise thousands
    text = /,\d{1,2}$/.test(text) && text.split(',').length === 2 ? text.replace(',', '.') : text.replace(/,/g, '');
  } else if (lastDot > -1 && text.split('.').length > 2) {
    text = text.replace(/\./g, '');
  }
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
}

export function downloadCsv(filename, columns, rows) {
  const blob = new Blob(['﻿', toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
