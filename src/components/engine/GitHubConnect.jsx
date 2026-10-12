import React, { useState } from 'react';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../ui/toast-context';
import { supabase, friendlyError } from '../../lib/supabase';
import { engine } from '../../lib/engine';
import Notice from '../ui/Notice';
import ConfirmButton from '../ui/ConfirmButton';

// Connects GitHub with a fine-grained, read-only token, and picks the repositories to watch
export default function GitHubConnect({ github, repos, selectedId, onSelect, onChanged }) {
  const toast = useToast();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(null);
  const [adding, setAdding] = useState('');
  const connected = github?.status === 'connected';

  const act = async (label, task) => {
    setBusy(label);
    setError('');
    const result = await task();
    setBusy('');
    if (result?.error) setError(result.error);
    return result;
  };

  const connect = async (e) => {
    e.preventDefault();
    const result = await act('connect', () => engine('github_connect', { token: token.trim() }));
    if (!result.error) {
      setToken('');
      toast.show({ message: `GitHub connected as ${result.login}.` });
      onChanged();
    }
  };

  const loadAvailable = async () => {
    const result = await act('repos', () => engine('github_repos'));
    if (!result.error) setAvailable(result.repos.filter((r) => !repos.some((x) => x.full_name === r.full_name)));
  };

  const add = async () => {
    if (!adding) return;
    const result = await act('add', () => engine('repo_add', { full_name: adding }));
    if (!result.error) {
      setAvailable(null);
      setAdding('');
      onChanged(result.repo.id);
    }
  };

  const remove = async (repo) => {
    const { error: removeError } = await supabase.from('engine_repos').delete().eq('id', repo.id);
    if (removeError) setError(friendlyError(removeError, 'Could not remove it. Try again.'));
    else {
      toast.show({ message: `Stopped watching ${repo.full_name}. Its runs and findings were deleted.` });
      onChanged(null);
    }
  };

  if (!connected) {
    return (
      <section className="card" aria-labelledby="gh-title">
        <div className="source-head">
          <GitBranch aria-hidden="true" />
          <div>
            <h2 id="gh-title" className="card-title">Connect GitHub</h2>
            <p className="card-subtitle">The engine reads your code with a token that can't change anything.</p>
          </div>
        </div>
        <ol className="field-help steps-list">
          <li>On GitHub, open Settings → Developer settings → Fine-grained tokens → Generate new token.</li>
          <li>Under Repository access, pick only the repositories you want checked.</li>
          <li>Give it read-only access to <strong>Contents</strong>, <strong>Pull requests</strong> and <strong>Metadata</strong>, nothing else.</li>
        </ol>
        {github?.status === 'error' && <Notice tone="error">{github.last_error}</Notice>}
        <form className="inline-form" onSubmit={connect} style={{ marginTop: 12 }}>
          <label className="visually-hidden" htmlFor="gh-token">Fine-grained token</label>
          <input id="gh-token" type="password" className="input-field" style={{ flex: 1, minWidth: 240 }} placeholder="github_pat_…" autoComplete="off" spellCheck="false" value={token} onChange={(e) => setToken(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!token.trim() || Boolean(busy)} aria-busy={busy === 'connect'}>{busy === 'connect' ? 'Checking…' : 'Connect GitHub'}</button>
        </form>
        <p className="field-help">Stored encrypted. Classic tokens (ghp_…) are refused because they can write to your repositories.</p>
        {error && <div style={{ marginTop: 10 }}><Notice tone="error">{error}</Notice></div>}
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="repos-title">
      <div className="section-header">
        <div className="source-head" style={{ alignItems: 'center' }}>
          <GitBranch aria-hidden="true" />
          <div>
            <h2 id="repos-title" className="card-title">Repositories</h2>
            <p className="card-subtitle">
              GitHub: {github.account_label}{github.expires_at ? ` · token expires ${new Date(github.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
            </p>
          </div>
        </div>
        <ConfirmButton label="Disconnect" question="Disconnect GitHub? Runs stop until you connect again." busyLabel="Disconnecting…" busy={busy === 'disconnect'} onConfirm={async () => { await act('disconnect', () => engine('github_disconnect')); onChanged(); }} />
      </div>

      {repos.length > 0 && (
        <div className="segmented segmented--wrap" role="group" aria-label="Repository" style={{ marginTop: 10 }}>
          {repos.map((r) => (
            <button key={r.id} type="button" aria-pressed={r.id === selectedId} onClick={() => onSelect(r.id)}>{r.full_name}</button>
          ))}
        </div>
      )}

      <div className="page-actions" style={{ marginTop: 12 }}>
        {available === null ? (
          repos.length < 5 && <button type="button" className="btn btn-secondary btn-sm" onClick={loadAvailable} disabled={Boolean(busy)} aria-busy={busy === 'repos'}><Plus aria-hidden="true" /> {busy === 'repos' ? 'Loading…' : 'Add a repository'}</button>
        ) : available.length ? (
          <>
            <label className="visually-hidden" htmlFor="repo-pick">Repository to add</label>
            <select id="repo-pick" className="input-field input-sm" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Pick a repository…</option>
              {available.map((r) => <option key={r.id} value={r.full_name}>{r.full_name}{r.private ? ' (private)' : ''}</option>)}
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={!adding || Boolean(busy)}>{busy === 'add' ? 'Adding…' : 'Add'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAvailable(null)}>Cancel</button>
          </>
        ) : (
          <span className="field-help">The token can't see any other repositories. Give it access to more on GitHub.</span>
        )}
        {selectedId && (
          <ConfirmButton
            label={<><Trash2 aria-hidden="true" /> Stop watching</>}
            question="Stop watching this repository? Its runs, findings and rules are deleted."
            busyLabel="Removing…"
            onConfirm={() => remove(repos.find((r) => r.id === selectedId))}
          />
        )}
      </div>
      {repos.length === 0 && available === null && <p className="field-help" style={{ marginTop: 8 }}>Add up to 5 repositories to check.</p>}
      {error && <div style={{ marginTop: 10 }}><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}
