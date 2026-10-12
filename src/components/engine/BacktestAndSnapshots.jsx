import React, { useEffect, useState } from 'react';
import { Copy, History } from 'lucide-react';
import { useToast } from '../ui/toast-context';
import { engine, rewindSteps, since } from '../../lib/engine';
import Notice from '../ui/Notice';

// "Run Backtest Simulator": re-runs a check at a past pull request, commit or snapshot and
// compares it with the latest run on HEAD, so you see what a change introduced or fixed.
export function Backtest({ repo, runs, snapshots, onStarted }) {
  const [module, setModule] = useState('preflight');
  const [kind, setKind] = useState('pr');
  const [ref, setRef] = useState('');
  const [merged, setMerged] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const head = runs.find((r) => r.module === module && r.trigger !== 'backtest' && r.status === 'succeeded');

  useEffect(() => {
    if (kind !== 'pr' || merged !== null) return;
    engine('github_prs', { repo_id: repo.id, state: 'closed' }).then((result) => setMerged(result.error ? [] : result.pulls));
  }, [kind, merged, repo.id]);

  const start = async () => {
    setBusy(true);
    setError('');
    const target = kind === 'pr' ? { kind: 'commit', ref: merged.find((p) => String(p.number) === ref)?.sha ?? '' } : { kind: 'commit', ref: ref.trim() };
    const result = await engine('run', { repo_id: repo.id, module, target, backtest_of: head.id });
    setBusy(false);
    if (result.error) return setError(result.error);
    onStarted(result.run_id);
  };

  return (
    <section className="card section" aria-labelledby="backtest-title">
      <div className="source-head">
        <History aria-hidden="true" />
        <div>
          <h2 id="backtest-title" className="card-title">Run Backtest Simulator</h2>
          <p className="card-subtitle">Check the code as it was at a merged pull request, a commit or a snapshot, then compare with the latest run on HEAD.</p>
        </div>
      </div>
      <div className="page-actions" style={{ marginTop: 12 }}>
        <label className="visually-hidden" htmlFor="bt-module">Check</label>
        <select id="bt-module" className="input-field input-sm" value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="preflight">Pre-Flight Scanner</option>
          <option value="red_team">Red Team Agents</option>
          <option value="drift">Context & Drift</option>
        </select>
        <div className="segmented" role="group" aria-label="Past version">
          <button type="button" aria-pressed={kind === 'pr'} onClick={() => { setKind('pr'); setRef(''); }}>Merged PR</button>
          <button type="button" aria-pressed={kind === 'commit'} onClick={() => { setKind('commit'); setRef(''); }}>Commit or snapshot</button>
        </div>
        {kind === 'pr' ? (
          <select className="input-field input-sm" aria-label="Merged pull request" value={ref} onChange={(e) => setRef(e.target.value)} disabled={merged === null}>
            <option value="">{merged === null ? 'Loading…' : merged.length ? 'Pick a merged pull request…' : 'No merged pull requests'}</option>
            {(merged ?? []).map((p) => <option key={p.number} value={p.number}>#{p.number} {p.title.slice(0, 50)}</option>)}
          </select>
        ) : (
          <>
            <input className="input-field input-sm" aria-label="Commit SHA or snapshot tag" list="snapshot-tags" placeholder="SHA or vibe-snapshot-…" value={ref} onChange={(e) => setRef(e.target.value)} spellCheck="false" />
            <datalist id="snapshot-tags">{snapshots.map((s) => <option key={s.id} value={s.tag} />)}</datalist>
          </>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={start} disabled={busy || !ref || !head} aria-busy={busy}>{busy ? 'Starting…' : 'Run backtest'}</button>
      </div>
      {!head && <p className="field-help" style={{ marginTop: 8 }}>Run this check on your current branch first; the backtest compares against it.</p>}
      <p className="field-help" style={{ marginTop: 8 }}>Mutation, Vision and Snapshots run in GitHub: re-run them at a past commit with <code>gh workflow run vibeassist.yml -f ref=&lt;sha&gt;</code>.</p>
      {error && <div style={{ marginTop: 10 }}><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

export function Snapshots({ snapshots }) {
  const toast = useToast();
  const [open, setOpen] = useState(null);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: 'Copied.' });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser. Select the text instead.', tone: 'error' });
    }
  };
  return (
    <section className="section" aria-labelledby="snapshots-title">
      <div className="section-header">
        <h2 id="snapshots-title">Snapshots</h2>
        <span className="field-help">Tagged by the GitHub Action after each passing push to your main branch.</span>
      </div>
      {snapshots.length === 0 ? (
        <div className="card empty-state"><p>No snapshots yet. Add the Snapshot Engine to your workflow (below) and push to your main branch.</p></div>
      ) : (
        <ul className="card card--flush rule-list">
          {snapshots.map((s) => (
            <li key={s.id}>
              <div>
                <strong><code>{s.tag}</code></strong>
                <p className="field-help">{s.commit_sha.slice(0, 7)} on {s.branch ?? 'main'} · {since(s.created_at)}{s.run_url ? <> · <a href={s.run_url} target="_blank" rel="noreferrer">run</a></> : null}</p>
                {open === s.id && <pre className="code-block">{rewindSteps(s.tag).join('\n')}</pre>}
              </div>
              <div className="page-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Hide' : 'Rewind steps'}</button>
                {open === s.id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(rewindSteps(s.tag).filter((l) => !l.startsWith('#')).slice(0, 2).join('\n'))}><Copy aria-hidden="true" /> Copy</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
