#!/usr/bin/env node
// Pre-commit secret scan: checks the lines you're about to commit against the same patterns as
// the Pre-flight Scanner, and stops the commit if one looks like a real key.
// Skip it once with: git commit --no-verify
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { patterns } = JSON.parse(readFileSync(join(here, 'secret-patterns.json'), 'utf8'));
const compiled = patterns.filter((p) => p.severity !== 'low').map((p) => ({ ...p, re: new RegExp(p.regex, p.flags ?? '') }));
const placeholder = /(x{6,}|\*{4,}|example|placeholder|your[_-]?(key|token|secret)|changeme|<[^>]+>|\$\{)/i;

const diff = execFileSync('git', ['diff', '--cached', '-U0', '--no-color'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let file = '';
let line = 0;
const hits = [];
for (const raw of diff.split('\n')) {
  if (raw.startsWith('+++ ')) {
    file = raw.slice(6);
  } else if (raw.startsWith('@@')) {
    line = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0) - 1;
  } else if (raw.startsWith('+')) {
    line++;
    for (const p of compiled) {
      const match = p.re.exec(raw);
      if (match && !placeholder.test(match[0])) hits.push(`${file}:${line}  ${p.title} (${match[0].slice(0, 4)}…)`);
    }
  }
}

if (hits.length) {
  console.error('\nVibeAssist stopped this commit: it looks like it contains secrets.\n');
  for (const h of hits) console.error(`  ${h}`);
  console.error('\nRemove them (keep secrets in environment variables), or commit with --no-verify if they are not real.\n');
  process.exit(1);
}
