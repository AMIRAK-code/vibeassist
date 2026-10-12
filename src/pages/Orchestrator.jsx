import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/ui/toast-context';
import { friendlyError, supabase } from '../lib/supabase';
import { usePersistentState } from '../lib/usePersistentState';
import { aiLabel, effectiveAiChoice, engine, isActive } from '../lib/engine';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';
import GitHubConnect from '../components/engine/GitHubConnect';
import ModuleTiles from '../components/engine/ModuleTiles';
import EngineStatus from '../components/engine/EngineStatus';
import FindingsList from '../components/engine/FindingsList';
import RulesEditor from '../components/engine/RulesEditor';
import { Backtest, Snapshots } from '../components/engine/BacktestAndSnapshots';
import Gateway from '../components/engine/Gateway';
import EngineAi from '../components/engine/EngineAi';
import ActionSetup from '../components/engine/ActionSetup';

// The Anti-Fragile Vibe Orchestrator: guards for code written with AI tools. Pre-flight, Red
// Team and Context & Drift run here against GitHub; Mutation, Vision and Snapshots run in the
// user's GitHub Actions and report back; the Smart Token Gateway routes their apps' LLM calls.
export default function Orchestrator() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [github, setGithub] = useState(undefined);
  const [repos, setRepos] = useState([]);
  const [repoId, setRepoId] = usePersistentState('engine-repo', null);
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(params.get('run'));
  const [events, setEvents] = useState([]);
  const [findings, setFindings] = useState([]);
  const [rules, setRules] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [gateway, setGateway] = useState({ providerKeys: [], routes: [], gatewayKeys: [], usage: [], engineKey: null });
  const [aiSettings, setAiSettings] = useState(null);
  const [busy, setBusy] = useState('');
  const [loadError, setLoadError] = useState('');
  const findingsRef = useRef(null);

  const repo = repos.find((r) => r.id === repoId) ?? repos[0] ?? null;
  const selectedRun = runs.find((r) => r.id === runId) ?? runs[0] ?? null;

  const loadAccount = useCallback(async (focusRepo) => {
    const [integration, repoRows, keys, routes, apiKeys, usage, ai] = await Promise.all([
      supabase.from('integrations').select('status, account_label, last_error, expires_at').eq('provider', 'github').maybeSingle(),
      supabase.from('engine_repos').select('*').order('created_at'),
      supabase.from('gateway_provider_keys').select('*').order('created_at'),
      supabase.from('gateway_routes').select('*').order('alias'),
      supabase.from('api_keys').select('id, key_prefix, scope, label, created_at, last_used_at').in('scope', ['engine', 'gateway']).is('revoked_at', null).order('created_at'),
      supabase.from('gateway_usage').select('status, fallback_used, input_tokens, output_tokens').gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()).limit(5000),
      supabase.from('engine_ai_settings').select('*').maybeSingle(),
    ]);
    if (repoRows.error) {
      setLoadError(friendlyError(repoRows.error, 'Could not load the engine.'));
      setGithub((g) => g ?? null);
      return;
    }
    setLoadError('');
    setGithub(integration.data ?? null);
    setRepos(repoRows.data);
    if (focusRepo !== undefined) setRepoId(focusRepo ?? repoRows.data[0]?.id ?? null);
    setGateway({
      providerKeys: keys.data ?? [],
      routes: routes.data ?? [],
      gatewayKeys: (apiKeys.data ?? []).filter((k) => k.scope === 'gateway'),
      engineKey: (apiKeys.data ?? []).find((k) => k.scope === 'engine') ?? null,
      usage: usage.data ?? [],
    });
    setAiSettings(ai.data ?? null);
  }, [setRepoId]);

  const loadRepo = useCallback(async () => {
    if (!repo) return;
    const [runRows, ruleRows, snapRows] = await Promise.all([
      supabase.from('engine_runs').select('*').eq('repo_id', repo.id).order('created_at', { ascending: false }).limit(40),
      supabase.from('engine_context_rules').select('*').eq('repo_id', repo.id).order('created_at'),
      supabase.from('engine_snapshots').select('*').eq('repo_id', repo.id).order('created_at', { ascending: false }).limit(30),
    ]);
    setRuns(runRows.data ?? []);
    setRules(ruleRows.data ?? []);
    setSnapshots(snapRows.data ?? []);
  }, [repo]);

  const loadRun = useCallback(async () => {
    if (!selectedRun) {
      setEvents([]);
      setFindings([]);
      return;
    }
    const [eventRows, findingRows] = await Promise.all([
      supabase.from('engine_run_events').select('*').eq('run_id', selectedRun.id).order('id'),
      supabase.from('engine_findings').select('*').eq('run_id', selectedRun.id),
    ]);
    setEvents(eventRows.data ?? []);
    setFindings(findingRows.data ?? []);
  }, [selectedRun]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);
  useEffect(() => {
    loadRepo();
  }, [loadRepo]);
  useEffect(() => {
    loadRun();
  }, [loadRun]);

  // While a run is going, follow it every two seconds
  const active = runs.some(isActive);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      loadRepo();
      loadRun();
    }, 2000);
    return () => clearInterval(timer);
  }, [active, loadRepo, loadRun]);

  const start = async (module, target) => {
    setBusy(module);
    const result = await engine('run', { repo_id: repo.id, module, target });
    setBusy('');
    if (result.error) {
      toast.show({ message: result.error, tone: 'error' });
      return;
    }
    setRunId(result.run_id);
    await loadRepo();
    document.getElementById('status-title')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const jump = (target) => {
    if (target === 'action-setup' || target === 'gateway' || target === 'engine-ai') {
      document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    setRunId(target);
    requestAnimationFrame(() => findingsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  if (github === undefined) {
    return (
      <>
        <PageHeader title="Anti-Fragile Vibe Orchestrator" />
        <div className="skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading the engine" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Anti-Fragile Vibe Orchestrator"
        description="Premium service: an orchestration layer that keeps AI-written code from collapsing under its own architecture or leaking secrets."
      >
        <Link to="/orchestrator/api" className="btn btn-ghost">View API Specs</Link>
      </PageHeader>

      {loadError && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => loadAccount()}>Try again</button>}>{loadError}</Notice>}

      <GitHubConnect github={github} repos={repos} selectedId={repo?.id ?? null} onSelect={(id) => { setRepoId(id); setRunId(null); }} onChanged={(focus) => loadAccount(focus)} />

      {repo && (
        <>
          <ModuleTiles
            key={repo.id}
            repo={repo}
            runs={runs}
            gatewayRoutes={gateway.routes.length}
            hasRules={rules.some((r) => r.enabled)}
            aiLabel={aiLabel(aiSettings, gateway.providerKeys)}
            onStart={start}
            onJump={jump}
            busy={busy}
          />
          <EngineStatus runs={runs} selected={selectedRun} events={events} onSelect={setRunId} />
          <div ref={findingsRef}>
            <FindingsList run={selectedRun} findings={findings} onChanged={loadRun} />
          </div>
          <RulesEditor repo={repo} rules={rules} driftRuns={runs.filter((r) => r.module === 'drift' && r.trigger !== 'backtest')} onChanged={loadRepo} />
          <Backtest repo={repo} runs={runs} snapshots={snapshots} onStarted={(id) => { setRunId(id); loadRepo(); }} />
          <Snapshots snapshots={snapshots} />
          <ActionSetup repo={repo} engineKey={gateway.engineKey} onChanged={() => loadAccount()} />
        </>
      )}

      <EngineAi
        key={Object.values(effectiveAiChoice(aiSettings, gateway.providerKeys)).join('|') + (aiSettings ? '' : '|unsaved')}
        providerKeys={gateway.providerKeys}
        settings={aiSettings}
        onChanged={() => loadAccount()}
        onJump={jump}
      />
      <Gateway {...gateway} onChanged={() => loadAccount()} />
    </>
  );
}
