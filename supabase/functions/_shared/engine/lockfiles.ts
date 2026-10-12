// Reads exact dependency versions out of lockfiles, for the OSV.dev vulnerability lookup.
// Only pinned versions count: a range in requirements.txt can't be checked, so it's reported
// separately as "unpinned".

export type Package = { ecosystem: 'npm' | 'PyPI' | 'Go' | 'crates.io' | 'RubyGems' | 'Packagist'; name: string; version: string; file: string };

export const LOCKFILES = [
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'requirements.txt', 'poetry.lock',
  'go.sum', 'Cargo.lock', 'Gemfile.lock', 'composer.lock',
];
export const isLockfile = (path: string) => LOCKFILES.includes(path.split('/').pop() ?? '');

const MAX_PACKAGES = 5000;

function packageLock(text: string, file: string): Package[] {
  const lock = JSON.parse(text);
  const out: Package[] = [];
  for (const [path, info] of Object.entries<{ version?: string; link?: boolean }>(lock.packages ?? {})) {
    if (!path || info.link || !info.version) continue;
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    out.push({ ecosystem: 'npm', name, version: info.version, file });
  }
  // lockfileVersion 1
  const walk = (deps: Record<string, { version?: string; dependencies?: unknown }> | undefined) => {
    for (const [name, info] of Object.entries(deps ?? {})) {
      if (info.version && /^\d/.test(info.version)) out.push({ ecosystem: 'npm', name, version: info.version, file });
      walk(info.dependencies as typeof deps);
    }
  };
  if (!lock.packages) walk(lock.dependencies);
  return out;
}

function pnpmLock(text: string, file: string): Package[] {
  const out: Package[] = [];
  // "  /lodash@4.17.21:" (v6) or "  lodash@4.17.21:" (v9), scoped names included
  for (const match of text.matchAll(/^ {2}'?\/?((?:@[^/@\s]+\/)?[^@\s/']+)@(\d[^:(\s']*)/gm)) {
    out.push({ ecosystem: 'npm', name: match[1], version: match[2], file });
  }
  return out;
}

function yarnLock(text: string, file: string): Package[] {
  const out: Package[] = [];
  for (const block of text.split(/\n(?=\S)/)) {
    const header = block.split('\n')[0];
    const name = /^"?((?:@[^/@"]+\/)?[^@",\s]+)@/.exec(header)?.[1];
    const version = /\n\s+version:?\s+"?([^"\s]+)"?/.exec(block)?.[1];
    if (name && version) out.push({ ecosystem: 'npm', name, version, file });
  }
  return out;
}

function requirements(text: string, file: string, unpinned: string[]): Package[] {
  const out: Package[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line || line.startsWith('-')) continue;
    const pinned = /^([A-Za-z0-9_.-]+)(\[[^\]]*\])?\s*==\s*([A-Za-z0-9_.+-]+)/.exec(line);
    if (pinned) out.push({ ecosystem: 'PyPI', name: pinned[1], version: pinned[3], file });
    else unpinned.push(line.split(/[<>=!~;\s[]/)[0]);
  }
  return out;
}

// [[package]] blocks with name = "…" and version = "…" (poetry.lock and Cargo.lock)
function tomlPackages(text: string, file: string, ecosystem: 'PyPI' | 'crates.io'): Package[] {
  const out: Package[] = [];
  for (const block of text.split('[[package]]').slice(1)) {
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (name && version) out.push({ ecosystem, name, version, file });
  }
  return out;
}

function goSum(text: string, file: string): Package[] {
  const seen = new Set<string>();
  const out: Package[] = [];
  for (const match of text.matchAll(/^(\S+) (v[^\s/]+?)(\/go\.mod)? /gm)) {
    const key = `${match[1]}@${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ecosystem: 'Go', name: match[1], version: match[2].replace(/^v/, ''), file });
  }
  return out;
}

function gemfileLock(text: string, file: string): Package[] {
  const specs = text.split(/\n {2}specs:\n/)[1]?.split(/\n\S/)[0] ?? '';
  return [...specs.matchAll(/^ {4}([A-Za-z0-9_.-]+) \(([^)]+)\)$/gm)].map((m) => ({ ecosystem: 'RubyGems' as const, name: m[1], version: m[2], file }));
}

function composerLock(text: string, file: string): Package[] {
  const lock = JSON.parse(text);
  return [...(lock.packages ?? []), ...(lock['packages-dev'] ?? [])]
    .filter((p: { name?: string; version?: string }) => p.name && p.version)
    .map((p: { name: string; version: string }) => ({ ecosystem: 'Packagist' as const, name: p.name, version: p.version.replace(/^v/, ''), file }));
}

// Every package in one lockfile; unpinned requirement names go into `unpinned`
export function parseLockfile(path: string, text: string, unpinned: string[] = []): Package[] {
  const base = path.split('/').pop();
  try {
    const packages = base === 'package-lock.json' ? packageLock(text, path)
      : base === 'pnpm-lock.yaml' ? pnpmLock(text, path)
        : base === 'yarn.lock' ? yarnLock(text, path)
          : base === 'requirements.txt' ? requirements(text, path, unpinned)
            : base === 'poetry.lock' ? tomlPackages(text, path, 'PyPI')
              : base === 'Cargo.lock' ? tomlPackages(text, path, 'crates.io')
                : base === 'go.sum' ? goSum(text, path)
                  : base === 'Gemfile.lock' ? gemfileLock(text, path)
                    : base === 'composer.lock' ? composerLock(text, path)
                      : [];
    const unique = new Map(packages.map((p) => [`${p.ecosystem}:${p.name}@${p.version}`, p]));
    return [...unique.values()].slice(0, MAX_PACKAGES);
  } catch {
    return []; // a lockfile that doesn't parse is reported by the caller as unreadable
  }
}
