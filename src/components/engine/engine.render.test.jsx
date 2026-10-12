// Smoke test: every Anti-Fragile Engine component renders with realistic data, so a typo in a
// prop or field name shows up here rather than as a blank page.
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../ui/Toast';
import GitHubConnect from './GitHubConnect';
import ModuleTiles from './ModuleTiles';
import EngineStatus from './EngineStatus';
import FindingsList from './FindingsList';
import RulesEditor from './RulesEditor';
import { Backtest, Snapshots } from './BacktestAndSnapshots';
import Gateway from './Gateway';
import ActionSetup from './ActionSetup';
import OrchestratorApi from '../../pages/OrchestratorApi';

// React marks text boundaries with <!-- --> in server output; drop them so text reads as shown
const render = (node) => renderToString(<MemoryRouter><ToastProvider>{node}</ToastProvider></MemoryRouter>).replace(/<!-- -->/g, '');
const noop = () => {};

const repo = { id: 'r1', full_name: 'faraz/app', default_branch: 'main', settings: {}, created_at: '2026-10-08T10:00:00Z' };
const runs = [
  { id: 'run1', module: 'red_team', trigger: 'manual', status: 'succeeded', outcome: 'fail', target_ref: '12', pr_number: 12, commit_sha: 'abcdef1234', created_at: '2026-10-08T10:00:00Z', summary: 'Security: one injection', stats: { diff: { new: 1, still_open: 0, resolved: 2 } } },
  { id: 'run2', module: 'drift', trigger: 'manual', status: 'running', target_ref: 'main', created_at: '2026-10-08T11:00:00Z', stats: {} },
  { id: 'run3', module: 'drift', trigger: 'manual', status: 'succeeded', outcome: 'warn', target_ref: 'main', created_at: '2026-10-07T11:00:00Z', stats: { drift_score: 40 } },
  { id: 'run4', module: 'drift', trigger: 'manual', status: 'succeeded', outcome: 'pass', target_ref: 'main', created_at: '2026-10-06T11:00:00Z', stats: { drift_score: 10 } },
  { id: 'run5', module: 'mutation', trigger: 'action', status: 'succeeded', outcome: 'pass', target_ref: 'main', created_at: '2026-10-06T11:00:00Z', external_url: 'https://github.com/x', stats: {} },
];

describe('Anti-Fragile Engine components', () => {
  it('render the GitHub connection in both states', () => {
    expect(render(<GitHubConnect github={null} repos={[]} selectedId={null} onSelect={noop} onChanged={noop} />)).toContain('github_pat_');
    expect(render(<GitHubConnect github={{ status: 'connected', account_label: 'faraz', expires_at: '2026-12-31T00:00:00Z' }} repos={[repo]} selectedId="r1" onSelect={noop} onChanged={noop} />)).toContain('faraz/app');
  });

  it('render all seven module tiles with their last runs', () => {
    const html = render(<ModuleTiles repo={repo} runs={runs} gatewayRoutes={2} hasRules onStart={noop} onJump={noop} busy="" />);
    for (const title of ['Red Team Agents', 'Pre-Flight Scanner', 'Context &amp; Drift', 'Mutation Validator', 'Vision Grounding', 'Snapshot Engine', 'Smart Token Gateway']) expect(html).toContain(title);
    expect(html).toContain('2 routes set up');
  });

  it('render the status log and findings', () => {
    const events = [{ id: 1, at: '2026-10-08T10:00:01Z', level: 'ok', message: 'Security reviewer: 1 finding' }];
    expect(render(<EngineStatus runs={runs} selected={runs[1]} events={events} onSelect={noop} />)).toContain('Engine Status: Running');
    const findings = [{ id: 'f1', severity: 'high', title: 'SQL built from user input', file: 'src/db.ts', line_start: 2, line_end: 2, evidence: 'q = "..." + id', explanation: 'Injection', fix: 'Use parameters', verified: false, confidence: 'medium', status: 'open' }];
    const html = render(<FindingsList run={runs[0]} findings={findings} onChanged={noop} />);
    expect(html).toContain('SQL built from user input');
    expect(html).toContain('Unverified');
    expect(html).toContain('2</strong> fixed');
  });

  it('render rules with the drift chart, backtest, snapshots, gateway and action setup', () => {
    const rules = [{ id: 'rule1', title: 'No console.log', body: '', kind: 'forbid_pattern', pattern: 'console\\.log', paths: ['src/**'], severity: 'low', enabled: true }];
    expect(render(<RulesEditor repo={repo} rules={rules} driftRuns={runs.filter((r) => r.module === 'drift')} onChanged={noop} />)).toContain('No console.log');
    expect(render(<Backtest repo={repo} runs={runs} snapshots={[]} onStarted={noop} />)).toContain('Run Backtest Simulator');
    expect(render(<Snapshots snapshots={[{ id: 's1', tag: 'vibe-snapshot-20261008-abc1234', commit_sha: 'abc1234def', branch: 'main', created_at: '2026-10-08T10:00:00Z' }]} />)).toContain('vibe-snapshot-20261008-abc1234');
    const gateway = render(<Gateway
      providerKeys={[{ id: 'k1', provider: 'anthropic', label: 'Main', key_prefix: 'sk-ant-…', created_at: '2026-10-08T10:00:00Z' }]}
      routes={[{ id: 'g1', alias: 'smart-default', api_format: 'anthropic', targets: [{ provider_key_id: 'k1', provider: 'anthropic', model: 'claude-opus-5-5' }] }]}
      gatewayKeys={[{ id: 'a1', key_prefix: 'va_1234567', label: 'Gateway key 1', last_used_at: null }]}
      usage={[{ status: 200, fallback_used: true, input_tokens: 10, output_tokens: 5 }]}
      onChanged={noop}
    />);
    expect(gateway).toContain('smart-default');
    expect(gateway).toContain('1 needed a fallback');
    expect(render(<ActionSetup repo={repo} engineKey={null} onChanged={noop} />)).toContain('VIBEASSIST_KEY');
    expect(render(<OrchestratorApi />)).toContain('/gateway/v1');
  });
});
