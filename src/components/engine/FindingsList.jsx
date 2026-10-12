import React, { useMemo, useState } from 'react';
import { useToast } from '../ui/toast-context';
import { friendlyError, supabase } from '../../lib/supabase';
import { bySeverity, moduleTitle, OUTCOME_LABEL, SEVERITY_ORDER, SEVERITY_TONE } from '../../lib/engine';

// What the selected run found, with what changed since the last run, and triage
export default function FindingsList({ run, findings, onChanged }) {
  const toast = useToast();
  const [severity, setSeverity] = useState('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const sorted = useMemo(() => [...findings].sort(bySeverity), [findings]);
  const visible = sorted.filter((f) => (severity === 'all' || f.severity === severity) && (showDismissed || f.status !== 'dismissed'));
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, findings.filter((f) => f.severity === s && f.status !== 'dismissed').length]));

  const setStatus = async (finding, status) => {
    const { error } = await supabase.from('engine_findings').update({ status }).eq('id', finding.id);
    if (error) {
      toast.show({ message: friendlyError(error, 'Could not save that. Try again.'), tone: 'error' });
      return;
    }
    onChanged();
    if (status === 'dismissed') toast.show({ message: `Dismissed “${finding.title}”.`, actionLabel: 'Undo', onAction: () => setStatus(finding, 'open') });
  };

  if (!run) return null;
  const diff = run.stats?.diff;
  const backtest = run.stats?.backtest;

  return (
    <section className="section" aria-labelledby="findings-title">
      <div className="section-header">
        <div>
          <h2 id="findings-title">Findings · {moduleTitle(run.module)}</h2>
          {run.summary && <p className="field-help" style={{ whiteSpace: 'pre-line' }}>{run.summary}</p>}
        </div>
        {run.outcome && <span className={`badge ${run.outcome === 'pass' ? 'badge--success' : run.outcome === 'fail' ? 'badge--danger' : 'badge--warning'}`}>{OUTCOME_LABEL[run.outcome]}</span>}
      </div>

      {(diff || backtest) && (
        <p className="engine-diff">
          {diff && <>Since the last run: <strong>{diff.new}</strong> new, <strong>{diff.still_open}</strong> still open, <strong>{diff.resolved}</strong> fixed.</>}
          {backtest && <>Compared with HEAD: <strong>{backtest.still_open}</strong> introduced here and still open, <strong>{backtest.fixed_since}</strong> fixed since, <strong>{backtest.new_since}</strong> new since.</>}
        </p>
      )}

      {findings.length > 0 && (
        <div className="page-actions" style={{ marginBottom: 10 }}>
          <div className="segmented segmented--wrap" role="group" aria-label="Severity">
            <button type="button" aria-pressed={severity === 'all'} onClick={() => setSeverity('all')}>All</button>
            {SEVERITY_ORDER.filter((s) => counts[s]).map((s) => (
              <button key={s} type="button" aria-pressed={severity === s} onClick={() => setSeverity(s)}>{s[0].toUpperCase() + s.slice(1)} · {counts[s]}</button>
            ))}
          </div>
          <label className="check-row" style={{ padding: 0 }}>
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> Show dismissed
          </label>
        </div>
      )}

      {run.status === 'succeeded' && visible.length === 0 && (
        <div className="card empty-state"><p>{findings.length ? 'Nothing matches this filter.' : 'Nothing found in this run.'}</p></div>
      )}

      <ul className="finding-list">
        {visible.map((f) => (
          <li key={f.id} className={`card finding finding--${f.status}`}>
            <div className="finding-head">
              <span className={`badge ${SEVERITY_TONE[f.severity] ? `badge--${SEVERITY_TONE[f.severity]}` : ''}`}>{f.severity}</span>
              <h3>{f.title}</h3>
              {!f.verified && <span className="badge" title="The evidence couldn't be matched to the code">Unverified</span>}
            </div>
            {f.file && <p className="finding-file"><code>{f.file}{f.line_start ? `:${f.line_start}${f.line_end && f.line_end !== f.line_start ? `-${f.line_end}` : ''}` : ''}</code></p>}
            {f.evidence && <pre className="code-block">{f.evidence}</pre>}
            {f.explanation && <p className="finding-text">{f.explanation}</p>}
            {f.fix && <p className="finding-text"><strong>Fix:</strong> {f.fix}</p>}
            <div className="page-actions">
              {f.status === 'dismissed'
                ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(f, 'open')}>Reopen</button>
                : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(f, 'dismissed')}>Dismiss<span className="visually-hidden">: {f.title}</span></button>}
              {f.confidence !== 'high' && <span className="field-help">Confidence: {f.confidence}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
