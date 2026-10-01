import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPERIENCE_OPTIONS, GOALS, PROFIT_OPTIONS } from './options';
import { PLATFORMS } from './launchChecklist';

// The database rejects values outside its check constraints, so the UI lists must match the
// latest migration exactly.
const migrations = readdirSync('supabase/migrations').sort().map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'));
const lastArray = (pattern) => {
  const matches = migrations.flatMap((sql) => [...sql.matchAll(pattern)]);
  return [...matches.at(-1)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe('answer lists match the database constraints', () => {
  it('goals', () => {
    expect(GOALS).toEqual(lastArray(/profiles_goals_check check \(goals <@ array\[([\s\S]*?)\]/g));
  });

  it('experience and monthly target', () => {
    expect(EXPERIENCE_OPTIONS.map((o) => o.value)).toEqual(lastArray(/check \(experience in \(([^)]*)\)\)/g));
    expect(PROFIT_OPTIONS.map((o) => o.value)).toEqual(lastArray(/check \(profit_expectancy in \(([^)]*)\)\)/g));
  });
});

describe('launch checklist', () => {
  const items = PLATFORMS.flatMap((p) => p.items);

  it('has stable, unique keys (they are stored on the profile)', () => {
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    expect(items.every((i) => /^[a-z]+(-[a-z]+)+$/.test(i.key))).toBe(true);
  });

  it('links every item to an https source', () => {
    expect(items.every((i) => i.source.startsWith('https://'))).toBe(true);
  });
});
