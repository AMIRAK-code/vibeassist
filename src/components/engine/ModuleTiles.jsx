import React, { useEffect, useState } from 'react';
import { Archive, Camera, FlaskConical, Play, Route, ScanSearch, ShieldAlert, Swords } from 'lucide-react';
import { engine, isActive, MODULES, OUTCOME_LABEL, RUN_LABEL, since } from '../../lib/engine';

const ICONS = { red_team: Swords, preflight: ScanSearch, drift: Route, mutation: FlaskConical, vision: Camera, snapshot: Archive, gateway: ShieldAlert };

// The seven module tiles. In-app modules run against the chosen branch or pull request; the
// others show their last report and where to set them up.
export default function ModuleTiles({ repo, runs, gatewayRoutes, hasRules, onStart, onJump, busy }) {
  const [kind, setKind] = useState('branch');
  const [branch, setBranch] = useState(repo.default_branch);
  const [pulls, setPulls] = useState(null);
  const [pr, setPr] = useState('');

  useEffect(() => {
    if (kind !== 'pr' || pulls !== null) return;
    engine('github_prs', { repo_id: repo.id, state: 'open' }).then((result) => setPulls(result.error ? [] : result.pulls));
  }, [kind, pulls, repo.id]);

  const target = kind === 'pr' ? { kind: 'pr', ref: pr } : { kind: 'branch', ref: branch.trim() || repo.default_branch };
  const ready = kind === 'branch' || Boolean(pr);
  const latest = (key) => runs.find((r) => r.module === key && r.trigger !== 'backtest');

  return (
    <section className="section" aria-labelledby="modules-title">
      <div className="section-header">
        <h2 id="modules-title">System Modules</h2>
        <div className="page-actions">
          <div className="segmented" role="group" aria-label="What to check">
            <button type="button" aria-pressed={kind === 'branch'} onClick={() => setKind('branch')}>Branch</button>
            <button type="button" aria-pressed={kind === 'pr'} onClick={() => setKind('pr')}>Pull request</button>
          </div>
          {kind === 'branch' ? (
            <>
              <label className="visually-hidden" htmlFor="target-branch">Branch</label>
              <input id="target-branch" className="input-field input-sm" value={branch} onChange={(e) => setBranch(e.target.value)} spellCheck="false" />
            </>
          ) : (
            <>
              <label className="visually-hidden" htmlFor="target-pr">Pull request</label>
              <select id="target-pr" className="input-field input-sm" value={pr} onChange={(e) => setPr(e.target.value)} disabled={pulls === null}>
                <option value="">{pulls === null ? 'Loading pull requests…' : pulls.length ? 'Pick an open pull request…' : 'No open pull requests'}</option>
                {(pulls ?? []).map((p) => <option key={p.number} value={p.number}>#{p.number} {p.title.slice(0, 60)}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="module-grid">
        {MODULES.map((m) => {
          const Icon = ICONS[m.key];
          const run = latest(m.key);
          return (
            <article key={m.key} className="card module-tile" aria-labelledby={`tile-${m.key}`}>
              <div className="module-tile-head">
                <Icon aria-hidden="true" />
                <h3 id={`tile-${m.key}`}>{m.title}</h3>
              </div>
              <p className="module-tile-desc">{m.desc}</p>
              <p className="module-tile-state">
                {m.key === 'gateway'
                  ? (gatewayRoutes ? `${gatewayRoutes} route${gatewayRoutes === 1 ? '' : 's'} set up` : 'Not set up')
                  : run
                    ? <button type="button" className="link-button" onClick={() => onJump(run.id)}>{RUN_LABEL[run.status]}{run.outcome ? ` · ${OUTCOME_LABEL[run.outcome]}` : ''} · {since(run.created_at)}</button>
                    : m.where === 'action' ? 'No report from GitHub yet' : 'Not run yet'}
              </p>
              <div className="module-tile-action">
                {m.where === 'app' ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onStart(m.key, target)}
                    disabled={!ready || Boolean(busy) || isActive(run) || (m.key === 'drift' && !hasRules)}
                    aria-busy={busy === m.key}
                    title={m.key === 'drift' && !hasRules ? 'Add a rule below first' : undefined}
                  >
                    <Play aria-hidden="true" /> {busy === m.key ? 'Starting…' : isActive(run) ? 'Running…' : 'Run'}
                  </button>
                ) : m.where === 'action' ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onJump('action-setup')}>Runs in GitHub: set up</button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onJump('gateway')}>{gatewayRoutes ? 'Manage' : 'Set up'}</button>
                )}
                {m.ai && <span className="field-help">Uses Claude</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
