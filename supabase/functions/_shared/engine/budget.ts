// Chooses what Claude reads in a review: the riskiest changed files first, numbered lines,
// capped so a run stays affordable and inside the model's context. Skipped files are listed.

export type SourceFile = { path: string; text: string; changes?: number };

export const MAX_CHARS = 120_000;
const MAX_LINES_PER_FILE = 1500;

const SKIP = /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.git)\/|\.(lock|min\.js|min\.css|map|snap|svg|png|jpe?g|gif|webp|ico|pdf|woff2?|ttf)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/i;
const RISKY = /(auth|login|session|token|secret|password|payment|billing|stripe|webhook|admin|api|server|route|handler|controller|db|database|sql|query|migration|supabase|firebase|middleware|config|env|security|crypto|upload)/i;

export const isReviewable = (path: string) => !SKIP.test(path);

// Higher first: risky paths, then the files with the most changed lines
export function rankFiles(files: SourceFile[]) {
  return [...files].sort((a, b) => Number(RISKY.test(b.path)) - Number(RISKY.test(a.path)) || (b.changes ?? 0) - (a.changes ?? 0) || a.path.localeCompare(b.path));
}

export function numbered(text: string) {
  const lines = text.split('\n');
  const shown = lines.slice(0, MAX_LINES_PER_FILE);
  const body = shown.map((line, i) => `${String(i + 1).padStart(5)}  ${line}`).join('\n');
  return { body, truncated: lines.length > MAX_LINES_PER_FILE, lines: lines.length };
}

// Builds the <file> blocks Claude sees, within the character budget
export function buildContext(files: SourceFile[], budget = MAX_CHARS) {
  const included: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const blocks: string[] = [];
  let used = 0;
  for (const file of rankFiles(files)) {
    if (!isReviewable(file.path)) {
      skipped.push({ path: file.path, reason: 'generated, vendored or binary' });
      continue;
    }
    const { body, truncated, lines } = numbered(file.text);
    const block = `<file path="${file.path}" lines="${lines}"${truncated ? ' truncated="true"' : ''}>\n${body}\n</file>`;
    if (used + block.length > budget) {
      skipped.push({ path: file.path, reason: 'over the size limit for one review' });
      continue;
    }
    blocks.push(block);
    included.push(file.path);
    used += block.length;
  }
  return { text: blocks.join('\n\n'), included, skipped, chars: used };
}
