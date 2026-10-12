// Anti-Fragile Engine, for the signed-in user (Premium).
//
// POST { action: 'github_connect', token }       -> { login, expires_at }  (fine-grained, read-only token)
// POST { action: 'github_disconnect' }
// POST { action: 'github_repos' }                -> { repos }
// POST { action: 'repo_add', full_name }          -> { repo }   (up to 5)
// POST { action: 'github_prs', repo_id, state }   -> { pulls }
// POST { action: 'run', repo_id, module: 'preflight' | 'red_team' | 'drift', target: { kind, ref }, backtest_of? }
//   -> 202 { run_id }; the run continues in the background and logs to engine_run_events
// POST { action: 'rules_suggest', repo_id }       -> { rules } drafted from CLAUDE.md, AGENTS.md, .cursorrules…
// POST { action: 'gateway_key_add', provider, label, key } / { action: 'gateway_key_remove', id }
// POST { action: 'ai_settings_save', provider_key_id | null, model } -> { settings }  (which AI the checks use)
// POST { action: 'ai_test' }                     -> { ok, label, model }  (one tiny call with that choice)
//
// Secrets: ANTHROPIC_API_KEY (unless users bring their own key, from any gateway provider), optional ENGINE_MODEL.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { corsHeaders, json, projectKey } from '../_shared/http.ts';
import { compareRuns, outcomeOf, prepareFindings } from '../_shared/engine/findings.ts';
import { checkToken, explainGitHubError, fileContents, getRepo, getTree, GitHubError, listPulls, listRepos, resolveTarget } from '../_shared/engine/github.ts';
import { PROVIDERS, type Provider } from '../_shared/engine/gatewayRouting.ts';
import { RULES_SCHEMA, SUGGEST_RULES } from '../_shared/engine/prompts.ts';
import { engineAi, structuredCall } from '../_shared/engineAi.ts';
import { type Ctx, NOTES, runDrift, runPreflight, runRedTeam } from './modules.ts';

const MAX_REPOS = 5;
const IN_APP_MODULES = ['preflight', 'red_team', 'drift'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(url, projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authError } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (authError || !user) return json({ error: 'Sign in first.' }, 401);
  const { data: premium } = await db.rpc('has_premium');
  if (!premium) return json({ error: 'The Anti-Fragile Engine is part of Premium.' }, 403);

  // Bypasses RLS: only ever used for this user's rows
  const admin = createClient(url, projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }

  // Runs stuck for over 10 minutes didn't survive the background time limit
  await admin.from('engine_runs').update({ status: 'timed_out', finished_at: new Date().toISOString(), error: 'The run took longer than the time limit. Try a pull request or narrower review paths.' })
    .eq('user_id', user.id).in('status', ['queued', 'running']).lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
  if (Math.random() < 0.02) await admin.rpc('engine_prune');

  const tokenName = `github_token:${user.id}`;
  const githubToken = async () => {
    const { data } = await admin.rpc('engine_secret_get', { p_name: tokenName });
    if (!data) throw new GitHubError(400, 'Connect GitHub first.');
    return data as string;
  };
  const loadRepo = async (id: string) => {
    const { data } = await admin.from('engine_repos').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!data) throw new GitHubError(404, 'That repository isn\'t added to the engine.');
    return data;
  };

  try {
    switch (body.action) {
      case 'github_connect': {
        const token = String(body.token ?? '').trim();
        const { login, expiresAt } = await checkToken(token);
        const { error } = await admin.rpc('engine_secret_store', { p_name: tokenName, p_secret: token });
        if (error) throw error;
        await admin.from('integrations').upsert({
          user_id: user.id, provider: 'github', status: 'connected', account_label: login, last_error: null,
          connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), expires_at: expiresAt,
        });
        return json({ login, expires_at: expiresAt });
      }

      case 'github_disconnect': {
        await admin.rpc('engine_secret_delete', { p_name: tokenName });
        await admin.from('integrations').update({ status: 'disconnected', account_label: null, expires_at: null, updated_at: new Date().toISOString() })
          .eq('user_id', user.id).eq('provider', 'github');
        return json({ disconnected: true });
      }

      case 'github_repos':
        return json({ repos: await listRepos(await githubToken()) });

      case 'repo_add': {
        const fullName = String(body.full_name ?? '');
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) return json({ error: 'Pick a repository from the list.' }, 400);
        const { count } = await admin.from('engine_repos').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
        if ((count ?? 0) >= MAX_REPOS) return json({ error: `You can watch up to ${MAX_REPOS} repositories. Remove one first.` }, 409);
        const info = await getRepo(await githubToken(), fullName);
        const { data, error } = await admin.from('engine_repos').upsert({
          user_id: user.id, full_name: info.full_name, github_id: info.id, default_branch: info.default_branch, private: info.private,
        }, { onConflict: 'user_id,full_name' }).select().single();
        if (error) throw error;
        return json({ repo: data });
      }

      case 'github_prs': {
        const repo = await loadRepo(body.repo_id);
        return json({ pulls: await listPulls(await githubToken(), repo.full_name, body.state === 'closed' ? 'closed' : 'open') });
      }

      case 'run': {
        const repo = await loadRepo(body.repo_id);
        const module = String(body.module);
        if (!IN_APP_MODULES.includes(module)) return json({ error: 'That module runs in the GitHub Action, not here.' }, 400);
        const kind = ['branch', 'commit', 'pr'].includes(body.target?.kind) ? body.target.kind : 'branch';
        const ref = String(body.target?.ref ?? repo.default_branch).slice(0, 200);
        if (kind === 'pr' && !/^\d+$/.test(ref)) return json({ error: 'Pick a pull request.' }, 400);
        const token = await githubToken();

        let rules: { id: string; title: string; body: string; kind: string; pattern: string | null; paths: string[]; severity: 'medium' }[] = [];
        if (module === 'drift') {
          const { data } = await admin.from('engine_context_rules').select('*').eq('repo_id', repo.id).eq('enabled', true);
          rules = data ?? [];
          if (!rules.length) return json({ error: 'Add at least one rule for this repository first.' }, 400);
        }
        const needsAi = module === 'red_team' || (module === 'drift' && rules.some((r) => r.kind === 'ai'));
        const choice = needsAi ? await engineAi(admin, user.id) : null;
        if (choice && 'error' in choice) return json({ error: choice.error }, choice.status);
        const ai = choice && 'ai' in choice ? choice.ai : null;

        const { data: run, error } = await admin.from('engine_runs').insert({
          user_id: user.id, repo_id: repo.id, module, trigger: body.backtest_of ? 'backtest' : 'manual',
          target_kind: kind, target_ref: ref, backtest_of: body.backtest_of ?? null,
        }).select().single();
        if (error) throw error;

        const log = async (level: 'info' | 'ok' | 'warn' | 'error', message: string) => {
          await admin.from('engine_run_events').insert({ run_id: run.id, user_id: user.id, level, message: message.slice(0, 300) });
        };

        const work = async () => {
          await admin.from('engine_runs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', run.id);
          try {
            const target = await resolveTarget(token, repo.full_name, { kind, ref });
            await admin.from('engine_runs').update({ commit_sha: target.sha, pr_number: target.pr }).eq('id', run.id);
            await log('info', `${module === 'preflight' ? 'Pre-flight Scanner' : module === 'red_team' ? 'Red Team' : 'Context & Drift'} on ${repo.full_name} at ${kind === 'pr' ? `PR #${ref}` : ref} (${target.sha.slice(0, 7)})${ai?.ownKey ? `, using your ${ai.label} key (${ai.model})` : ''}`);
            const ctx: Ctx = { token, repo, sha: target.sha, pr: target.pr, prTitle: target.title, ref, log, admin, userId: user.id };
            const result = module === 'preflight' ? await runPreflight(ctx)
              : module === 'red_team' ? await runRedTeam(ctx, ai!)
                : await runDrift(ctx, rules, ai);

            const rows = await prepareFindings(result.findings, { run_id: run.id, user_id: user.id, repo_id: repo.id });
            for (let i = 0; i < rows.length; i += 200) {
              const { error: insertError } = await admin.from('engine_findings').insert(rows.slice(i, i + 200));
              if (insertError) throw insertError;
            }

            // What changed since the last run of this module on this repo, or against HEAD for a backtest
            const stats: Record<string, unknown> = { ...result.stats, findings: rows.length };
            const fingerprints = rows.map((r) => r.fingerprint);
            const compareWith = async (otherRunId: string) => {
              const { data } = await admin.from('engine_findings').select('fingerprint').eq('run_id', otherRunId);
              return (data ?? []).map((f: { fingerprint: string }) => f.fingerprint);
            };
            if (body.backtest_of) {
              const head = await compareWith(body.backtest_of);
              const diff = compareRuns(fingerprints, head);
              // From the past ref's point of view: still open at HEAD, fixed since, new since
              stats.backtest = { still_open: diff.still_open, fixed_since: diff.new, new_since: diff.resolved };
            } else {
              const { data: previous } = await admin.from('engine_runs').select('id')
                .eq('repo_id', repo.id).eq('module', module).eq('status', 'succeeded').neq('trigger', 'backtest').neq('id', run.id)
                .order('created_at', { ascending: false }).limit(1).maybeSingle();
              if (previous) stats.diff = compareRuns(fingerprints, await compareWith(previous.id));
            }

            await admin.from('engine_runs').update({
              status: 'succeeded', outcome: outcomeOf(rows), summary: result.summary.slice(0, 2000), stats,
              model: result.model ?? null, finished_at: new Date().toISOString(),
            }).eq('id', run.id);
            await log('ok', `Finished: ${rows.length} finding${rows.length === 1 ? '' : 's'}`);
          } catch (error) {
            const message = error instanceof GitHubError ? explainGitHubError(error)
              : (error as Error)?.message === 'not_configured' ? 'No AI key is set up for the engine yet. Choose one under Engine AI.'
                : String((error as Error)?.message ?? error).slice(0, 300);
            console.error('Engine run failed', run.id, message);
            await log('error', message);
            await admin.from('engine_runs').update({ status: 'failed', error: message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', run.id);
          }
        };
        EdgeRuntime.waitUntil(work());
        return json({ run_id: run.id }, 202);
      }

      case 'rules_suggest': {
        const repo = await loadRepo(body.repo_id);
        const token = await githubToken();
        const choice = await engineAi(admin, user.id);
        if ('error' in choice) return json({ error: choice.error }, choice.status);
        const info = await getRepo(token, repo.full_name);
        const tree = await getTree(token, repo.full_name, info.default_branch);
        const notes = tree.entries.filter((e) => e.type === 'blob' && NOTES.test(e.path)).map((e) => e.path).slice(0, 8);
        if (!notes.length) return json({ error: 'No CLAUDE.md, AGENTS.md, .cursorrules or architecture notes found on the default branch.' }, 404);
        const texts = await fileContents(token, repo.full_name, info.default_branch, notes);
        const block = [...texts].map(([path, text]) => `<repo path="${path}">\n${text.slice(0, 20000)}\n</repo>`).join('\n');
        const result = await structuredCall<{ rules: { title: string; body: string; paths: string[]; severity: string }[] }>(
          choice.ai, admin, user.id, [SUGGEST_RULES, block], 'Suggest the rules.', RULES_SCHEMA,
        );
        if (!result.data?.rules) return json({ error: `${choice.ai.label === 'VibeAssist' ? 'The AI' : choice.ai.label} couldn't suggest rules from these notes. Try writing a few yourself.` }, 502);
        return json({ rules: result.data.rules.slice(0, 8), from: notes });
      }

      case 'gateway_key_add': {
        const provider = String(body.provider) as Provider;
        if (!PROVIDERS[provider]) return json({ error: 'Pick a provider.' }, 400);
        const key = String(body.key ?? '').trim();
        if (key.length < 20 || /\s/.test(key)) return json({ error: 'That doesn\'t look like an API key.' }, 400);
        const { count } = await admin.from('gateway_provider_keys').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
        if ((count ?? 0) >= 10) return json({ error: 'You can store up to 10 provider keys.' }, 409);
        const { data: row, error } = await admin.from('gateway_provider_keys').insert({
          user_id: user.id, provider, label: String(body.label ?? '').trim().slice(0, 60) || PROVIDERS[provider].label, key_prefix: `${key.slice(0, 7)}…`,
        }).select().single();
        if (error) throw error;
        const { error: secretError } = await admin.rpc('engine_secret_store', { p_name: `gateway_key:${row.id}`, p_secret: key });
        if (secretError) {
          await admin.from('gateway_provider_keys').delete().eq('id', row.id);
          throw secretError;
        }
        return json({ key: row });
      }

      case 'ai_settings_save': {
        const keyId = body.provider_key_id ? String(body.provider_key_id) : null;
        let model = typeof body.model === 'string' ? body.model.trim() : '';
        if (keyId) {
          const { data: row } = await admin.from('gateway_provider_keys').select('id, provider').eq('id', keyId).eq('user_id', user.id).maybeSingle();
          if (!row) return json({ error: 'That key isn't in your Smart Token Gateway any more.' }, 404);
          if (!model && row.provider !== 'anthropic') return json({ error: `Enter the ${PROVIDERS[row.provider as Provider].label} model the checks should use.` }, 400);
        } else {
          model = '';
        }
        if (model && !/^[A-Za-z0-9._:/-]{1,100}$/.test(model)) return json({ error: 'Model names use letters, numbers and . _ : / - only.' }, 400);
        const { data, error } = await admin.from('engine_ai_settings').upsert({
          user_id: user.id, provider_key_id: keyId, model: model || null, updated_at: new Date().toISOString(),
        }).select().single();
        if (error) throw error;
        return json({ settings: data });
      }

      case 'ai_test': {
        const choice = await engineAi(admin, user.id);
        if ('error' in choice) return json({ error: choice.error }, choice.status);
        try {
          const result = await structuredCall<{ ok: boolean }>(
            choice.ai, admin, user.id, ['You confirm that an API connection works.'], 'Reply with {"ok": true}.',
            { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
          );
          if (!result.data) return json({ error: `${choice.ai.label} answered, but not in the JSON the checks need. Try a newer or larger model.` }, 502);
          return json({ ok: true, label: choice.ai.label, model: result.model, own_key: choice.ai.ownKey });
        } catch (error) {
          return json({ error: String((error as Error)?.message ?? error).slice(0, 300) }, 502);
        }
      }

      case 'gateway_key_remove': {
        const { data: row } = await admin.from('gateway_provider_keys').select('id').eq('id', body.id).eq('user_id', user.id).maybeSingle();
        if (!row) return json({ error: 'Key not found.' }, 404);
        await admin.rpc('engine_secret_delete', { p_name: `gateway_key:${row.id}` });
        await admin.from('gateway_provider_keys').delete().eq('id', row.id);
        return json({ removed: true });
      }

      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (error) {
    if (error instanceof GitHubError) return json({ error: error.status === 400 ? error.message : explainGitHubError(error) }, error.status === 404 ? 404 : 400);
    console.error('Engine request failed', error);
    return json({ error: 'Something went wrong on our side. Try again.' }, 500);
  }
});
