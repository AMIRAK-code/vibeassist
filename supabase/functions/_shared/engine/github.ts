// The GitHub calls the engine makes with the user's read-only fine-grained token.

export class GitHubError extends Error {
  constructor(public status: number, message: string, public rateLimited = false) {
    super(message);
  }
}

const API = 'https://api.github.com';

export async function gh(token: string, path: string, init: RequestInit = {}, fetchFn: typeof fetch = fetch) {
  const res = await fetchFn(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'VibeAssist-Engine',
      ...(init.headers ?? {}),
    },
  });
  if (res.ok) return { body: await res.json(), headers: res.headers };
  const body = await res.json().catch(() => ({}));
  const rateLimited = (res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0';
  throw new GitHubError(res.status, body?.message ?? `GitHub returned ${res.status}`, rateLimited);
}

export function explainGitHubError(error: GitHubError) {
  if (error.rateLimited) return 'GitHub\'s rate limit for this token is used up. Try again in an hour.';
  if (error.status === 401) return 'GitHub rejected the token. It may have expired or been deleted; paste a new one.';
  if (error.status === 403) return 'The token can\'t read this. Give it read access to Contents, Pull requests and Metadata for this repository.';
  if (error.status === 404) return 'GitHub couldn\'t find that repository, branch or pull request with this token.';
  return `GitHub error: ${error.message}`;
}

// Checks a pasted token: fine-grained only (classic tokens can write), and who it belongs to
export async function checkToken(token: string, fetchFn: typeof fetch = fetch) {
  if (!/^github_pat_[A-Za-z0-9_]{40,}$/.test(token)) {
    throw new GitHubError(400, 'Paste a fine-grained personal access token (it starts with github_pat_). Classic tokens can write to your repositories, so they aren\'t accepted.');
  }
  const { body, headers } = await gh(token, '/user', {}, fetchFn);
  const expiry = headers.get('github-authentication-token-expiration');
  return { login: body.login as string, expiresAt: expiry ? new Date(expiry.replace(' UTC', 'Z').replace(' ', 'T')).toISOString() : null };
}

export async function listRepos(token: string, fetchFn: typeof fetch = fetch) {
  const { body } = await gh(token, '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member', {}, fetchFn);
  return (body as { id: number; full_name: string; default_branch: string; private: boolean; pushed_at: string }[])
    .map((r) => ({ id: r.id, full_name: r.full_name, default_branch: r.default_branch, private: r.private, pushed_at: r.pushed_at }));
}

export const getRepo = (token: string, fullName: string, fetchFn: typeof fetch = fetch) => gh(token, `/repos/${fullName}`, {}, fetchFn).then((r) => r.body);

export async function listPulls(token: string, fullName: string, state: 'open' | 'closed' = 'open', fetchFn: typeof fetch = fetch) {
  const { body } = await gh(token, `/repos/${fullName}/pulls?state=${state}&per_page=30&sort=updated&direction=desc`, {}, fetchFn);
  return (body as { number: number; title: string; head: { sha: string; ref: string }; merged_at: string | null; updated_at: string }[])
    .filter((p) => state === 'open' || p.merged_at)
    .map((p) => ({ number: p.number, title: p.title, sha: p.head.sha, ref: p.head.ref, merged_at: p.merged_at, updated_at: p.updated_at }));
}

// What a run looks at: a branch or commit's tree, or a pull request's head and changed files
export async function resolveTarget(token: string, fullName: string, target: { kind: string; ref: string }, fetchFn: typeof fetch = fetch) {
  if (target.kind === 'pr') {
    const { body: pr } = await gh(token, `/repos/${fullName}/pulls/${Number(target.ref)}`, {}, fetchFn);
    return { sha: pr.head.sha as string, pr: Number(target.ref), title: pr.title as string };
  }
  const { body } = await gh(token, `/repos/${fullName}/commits/${encodeURIComponent(target.ref)}`, {}, fetchFn);
  return { sha: body.sha as string, pr: null, title: String(body.commit?.message ?? '').split('\n')[0] };
}

export async function getTree(token: string, fullName: string, sha: string, fetchFn: typeof fetch = fetch) {
  const { body } = await gh(token, `/repos/${fullName}/git/trees/${sha}?recursive=1`, {}, fetchFn);
  return { entries: (body.tree ?? []).map((e: { path: string; type: string; size?: number }) => ({ path: e.path, type: e.type === 'tree' ? 'tree' : 'blob', size: e.size })) as { path: string; type: 'blob' | 'tree'; size?: number }[], truncated: Boolean(body.truncated) };
}

export async function pullFiles(token: string, fullName: string, pr: number, fetchFn: typeof fetch = fetch) {
  const files: { path: string; status: string; changes: number; patch?: string }[] = [];
  for (let page = 1; page <= 3; page++) {
    const { body } = await gh(token, `/repos/${fullName}/pulls/${pr}/files?per_page=100&page=${page}`, {}, fetchFn);
    for (const f of body) files.push({ path: f.filename, status: f.status, changes: f.changes, patch: f.patch });
    if (body.length < 100) break;
  }
  return files;
}

// Text of many files at once through one GraphQL query per 50 files. Binary and huge files are left out.
export async function fileContents(token: string, fullName: string, sha: string, paths: string[], fetchFn: typeof fetch = fetch) {
  const [owner, name] = fullName.split('/');
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 50) {
    const chunk = paths.slice(i, i + 50);
    const fields = chunk.map((p, j) => `f${j}: object(expression: ${JSON.stringify(`${sha}:${p}`)}) { ... on Blob { text isBinary byteSize } }`).join('\n');
    const query = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${fields} } }`;
    const { body } = await gh(token, '/graphql', { method: 'POST', body: JSON.stringify({ query }), headers: { 'Content-Type': 'application/json' } }, fetchFn);
    if (body.errors?.length && !body.data) throw new GitHubError(400, body.errors[0].message);
    chunk.forEach((p, j) => {
      const blob = body.data?.repository?.[`f${j}`];
      if (blob && !blob.isBinary && typeof blob.text === 'string') out.set(p, blob.text);
    });
  }
  return out;
}
