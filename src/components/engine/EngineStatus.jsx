import React, { useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { isActive, moduleTitle, OUTCOME_LABEL, RUN_LABEL, since } from '../../lib/engine';

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// "Engine Status": the recent runs for this repository and the live log of the selected one
export default function EngineStatus({ runs, selected, events, onSelect }) {
  const logEnd = useRef(null);
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [events.length]);

  const status = !runs.length ? 'Idle: no runs yet' : runs.some(isActive) ? 'Running' : 'Idle';

  return (
    <section className="section" aria-labelledby="status-title">
      <div className="section-header">
        <h2 id="status-title">Engine Status: {status}</h2>
      </div>
      <div className="engine-status">
        <ol className="card card--flush run-list" aria-label="Recent runs">
          {runs.length === 0 && <li className="muted" style={{ padding: 14 }}>Runs appear here. Start one from a module above.</li>}
          {runs.slice(0, 15).map((run) => (
            <li key={run.id}>
              <button type="button" aria-current={selected?.id === run.id ? 'true' : undefined} onClick={() => onSelect(run.id)}>
                <span className={`run-dot run-dot--${run.outcome ?? run.status}`} aria-hidden="true" />
                <span className="run-name">{moduleTitle(run.module)}{run.trigger === 'backtest' ? ' · backtest' : run.trigger === 'action' ? ' · GitHub' : ''}</span>
                <span className="field-help">{run.pr_number ? `PR #${run.pr_number}` : run.target_ref}{run.commit_sha ? ` @ ${run.commit_sha.slice(0, 7)}` : ''} · {RUN_LABEL[run.status]}{run.outcome ? `, ${OUTCOME_LABEL[run.outcome].toLowerCase()}` : ''} · {since(run.created_at)}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="terminal" role="log" aria-live="polite" aria-label="Run log">
          {!selected ? (
            <p className="terminal-line terminal-line--muted">&gt; Waiting for a run…</p>
          ) : (
            <>
              <p className="terminal-line terminal-line--muted">&gt; {moduleTitle(selected.module)} · {selected.id.slice(0, 8)}</p>
              {events.map((e) => (
                <p key={e.id} className={`terminal-line terminal-line--${e.level}`}>
                  <span className="terminal-time">{time(e.at)}</span> {e.level === 'ok' ? '✓' : e.level === 'warn' ? '!' : e.level === 'error' ? '✗' : '›'} {e.message}
                </p>
              ))}
              {isActive(selected) && <p className="terminal-line terminal-line--muted"><span className="spinner spinner--light" /> working…</p>}
              {selected.error && <p className="terminal-line terminal-line--error">✗ {selected.error}</p>}
              {selected.external_url && (
                <p className="terminal-line"><a href={selected.external_url} target="_blank" rel="noreferrer">Open the GitHub run <ExternalLink aria-hidden="true" className="inline-icon" /></a></p>
              )}
            </>
          )}
          <div ref={logEnd} />
        </div>
      </div>
    </section>
  );
}
