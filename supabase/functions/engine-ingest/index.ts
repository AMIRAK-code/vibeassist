// Reports from the VibeAssist GitHub Action: Mutation Validator, Vision Grounding and Snapshot Engine.
//
// POST with header "Authorization: Bearer va_…" (an engine key from the Anti-Fragile Engine page)
// {
//   repo: 'owner/name', sha, ref, pr_number?, run_url,
//   module: 'mutation' | 'vision' | 'snapshot', status: 'succeeded' | 'failed' | 'skipped',
//   summary, stats?, log?: string[], findings?: [{ title, severity, category?, file?, line_start?, line_end?, evidence?, explanation?, fix? }],
//   images?: [{ url, viewport, data }]   (vision: up to 6 JPEG screenshots, base64)
//   snapshot?: { tag, branch, checks? }   (snapshot)
// }
// -> { run_id, url }
//
// Deploy with JWT checks off: GitHub has no Supabase session; the engine key is checked here.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, projectKey } from '../_shared/http.ts';
import { type Finding, outcomeOf, prepareFindings, SEVERITIES } from '../_shared/engine/findings.ts';
import { scanText } from '../_shared/engine/secrets.ts';
import { VISION, VISION_SCHEMA } from '../_shared/engine/prompts.ts';
import { engineAi, structuredCall } from '../_shared/engineAi.ts';

const MODULES = ['mutation', 'vision', 'snapshot'];
const MAX_FINDINGS = 200;
const MAX_IMAGES = 6;
const MAX_IMAGE_CHARS = 2_000_000; // about 1.5 MB of JPEG
const VISION_RUNS_PER_DAY = 8;

const clip = (value: unknown, max: number) => (value === null || value === undefined ? null : String(value).slice(0, max));
const httpsOrNull = (value: unknown) => (typeof value === 'string' && /^https:\/\/\S+$/.test(value) ? value.slice(0, 500) : null);

// Whatever the Action quotes is checked for secrets before it is stored
function safeEvidence(text: unknown) {
  const value = clip(text, 600);
  return value && scanText(value).length ? '[removed: looked like a secret]' : value;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const key = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '') || req.headers.get('x-vibeassist-key') || '';
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: resolved } = await admin.rpc('resolve_api_key', { p_key: key, p_scope: 'engine' });
  const owner = resolved?.[0];
  if (!owner) return json({ error: 'Invalid or revoked engine key, or the account no longer has Premium. Create a new key on the Anti-Fragile Engine page and save it as the VIBEASSIST_KEY secret.' }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }
  if (!MODULES.includes(body.module)) return json({ error: 'module must be mutation, vision or snapshot.' }, 400);
  if (!/^[0-9a-f]{40}$/.test(String(body.sha ?? ''))) return json({ error: 'sha must be the full commit SHA.' }, 400);

  const { data: repos } = await admin.from('engine_repos').select('id, full_name').eq('user_id', owner.user_id);
  const repo = (repos ?? []).find((r: { full_name: string }) => r.full_name.toLowerCase() === String(body.repo ?? '').toLowerCase());
  if (!repo) return json({ error: `Add ${body.repo} on the Anti-Fragile Engine page first, then re-run the workflow.` }, 404);

  const status = ['succeeded', 'failed', 'skipped'].includes(body.status) ? body.status : 'succeeded';
  const findings: Finding[] = (Array.isArray(body.findings) ? body.findings : []).slice(0, MAX_FINDINGS).map((f: Record<string, unknown>) => ({
    module: body.module,
    severity: SEVERITIES.includes(f.severity as never) ? f.severity : 'medium',
    category: clip(f.category, 60),
    title: clip(f.title, 200) ?? 'Finding',
    file: clip(f.file, 500),
    line_start: Number.isInteger(f.line_start) ? f.line_start : null,
    line_end: Number.isInteger(f.line_end) ? f.line_end : null,
    evidence: safeEvidence(f.evidence),
    explanation: clip(f.explanation, 2000),
    fix: clip(f.fix, 2000),
    confidence: 'high',
    verified: true,
  }));
  const log: string[] = (Array.isArray(body.log) ? body.log : []).slice(0, 20).map((line: unknown) => String(line).slice(0, 300));
  let summary = clip(body.summary, 2000) ?? '';
  let model: string | null = null;

  // Vision Grounding: Claude looks at the screenshots the Action took
  if (body.module === 'vision' && Array.isArray(body.images) && body.images.length) {
    const images = body.images.slice(0, MAX_IMAGES).filter((img: { data?: string }) => typeof img?.data === 'string' && img.data.length <= MAX_IMAGE_CHARS && /^[A-Za-z0-9+/=]+$/.test(img.data));
    const { count } = await admin.from('engine_runs').select('id', { count: 'exact', head: true })
      .eq('user_id', owner.user_id).eq('module', 'vision').gte('created_at', new Date(Date.now() - 864e5).toISOString());
    const choice = (count ?? 0) < VISION_RUNS_PER_DAY ? await engineAi(admin, owner.user_id) : { error: `Screenshot checks are limited to ${VISION_RUNS_PER_DAY} a day`, status: 429 };
    if ('error' in choice) {
      log.push(`Claude didn't look at the screenshots: ${choice.error === 'not_configured' ? 'no Anthropic key is set up for the engine' : choice.error}`);
    } else if (images.length) {
      const content = images.flatMap((img: { url: string; viewport: number; data: string }) => [
        { type: 'text' as const, text: `Screenshot: ${String(img.url).slice(0, 200)} @ ${Number(img.viewport) || 0}px` },
        { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: img.data } },
      ]);
      try {
        const result = await structuredCall<{ findings: { title: string; severity: 'high' | 'medium' | 'low'; file: string; evidence: string; fix: string }[] }>(
          choice.ai, admin, owner.user_id, [VISION], [...content, { type: 'text' as const, text: 'Check these screenshots for layout problems.' }], VISION_SCHEMA,
        );
        model = result.model;
        for (const f of result.data?.findings ?? []) {
          findings.push({ module: 'vision', severity: f.severity, category: 'layout', title: f.title.slice(0, 200), file: f.file.slice(0, 500), evidence: f.evidence.slice(0, 600), fix: f.fix.slice(0, 2000), confidence: 'medium', verified: true });
        }
        log.push(`Claude checked ${images.length} screenshot${images.length === 1 ? '' : 's'}: ${result.data?.findings.length ?? 0} layout issue(s)`);
      } catch (error) {
        log.push(`Claude couldn't check the screenshots: ${String((error as Error)?.message ?? error).slice(0, 150)}`);
      }
    }
    summary = summary || `${findings.length} issue${findings.length === 1 ? '' : 's'} on ${images.length} screenshot${images.length === 1 ? '' : 's'}.`;
  }

  const stats = body.stats && typeof body.stats === 'object' && !Array.isArray(body.stats) ? body.stats : {};
  const { data: run, error: runError } = await admin.from('engine_runs').insert({
    user_id: owner.user_id, repo_id: repo.id, module: body.module, trigger: 'action',
    target_kind: body.pr_number ? 'pr' : 'commit', target_ref: clip(body.pr_number ?? body.ref ?? body.sha, 200),
    commit_sha: body.sha, pr_number: Number.isInteger(body.pr_number) ? body.pr_number : null,
    status, outcome: status === 'succeeded' ? outcomeOf(findings) : null, summary, stats, model,
    external_url: httpsOrNull(body.run_url), started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
  }).select().single();
  if (runError) {
    console.error('Could not save the Action report', runError);
    return json({ error: 'Could not save the report. Try again.' }, 500);
  }

  const events = [...log, `Reported by the GitHub Action${body.run_url ? '' : ' (no run link)'}: ${findings.length} finding${findings.length === 1 ? '' : 's'}`];
  await admin.from('engine_run_events').insert(events.map((message) => ({ run_id: run.id, user_id: owner.user_id, level: 'info', message })));
  const rows = await prepareFindings(findings, { run_id: run.id, user_id: owner.user_id, repo_id: repo.id });
  if (rows.length) await admin.from('engine_findings').insert(rows);

  if (body.module === 'snapshot' && status === 'succeeded') {
    const tag = String(body.snapshot?.tag ?? '');
    if (/^vibe-snapshot-[A-Za-z0-9._-]+$/.test(tag)) {
      await admin.from('engine_snapshots').upsert({
        user_id: owner.user_id, repo_id: repo.id, tag, commit_sha: body.sha, branch: clip(body.snapshot?.branch, 200),
        run_url: httpsOrNull(body.run_url), checks: body.snapshot?.checks && typeof body.snapshot.checks === 'object' ? body.snapshot.checks : {},
      }, { onConflict: 'repo_id,tag' });
    }
  }

  const site = (Deno.env.get('SITE_URL') ?? 'https://vibeassist.assist365.app').replace(/\/$/, '');
  return json({ run_id: run.id, url: `${site}/orchestrator?run=${run.id}` });
});
