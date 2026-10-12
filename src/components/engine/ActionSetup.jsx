import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { useToast } from '../ui/toast-context';
import { friendlyError, supabase } from '../../lib/supabase';
import { since } from '../../lib/engine';
import Notice from '../ui/Notice';
import ConfirmButton from '../ui/ConfirmButton';

const WORKFLOW = `name: VibeAssist Engine
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
    inputs:
      ref:
        description: Commit or tag to check (Backtest Simulator)
        required: false
permissions:
  contents: write # only the Snapshot Engine pushes, and only tags
jobs:
  engine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: \${{ inputs.ref || '' }}
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - uses: OWNER/vibeassist-engine@v1
        with:
          vibeassist-key: \${{ secrets.VIBEASSIST_KEY }}
          modules: mutation,vision,snapshot
          start-command: npm run build && npx vite preview --port 3000
          urls: /`;

// Mutation Validator, Vision Grounding and Snapshot Engine run in the user's own GitHub
// Actions and report back with an engine key
export default function ActionSetup({ repo, engineKey, onChanged }) {
  const toast = useToast();
  const [newKey, setNewKey] = useState('');

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: `${what} copied.` });
    } catch {
      toast.show({ message: 'Copying was blocked by the browser. Select the text instead.', tone: 'error' });
    }
  };

  const createKey = async () => {
    const { data, error } = await supabase.rpc('create_scoped_api_key', { p_scope: 'engine', p_label: 'GitHub Action' });
    if (error) return toast.show({ message: friendlyError(error, 'Could not create a key.'), tone: 'error' });
    setNewKey(data);
    onChanged();
  };

  return (
    <section className="card section" id="action-setup" aria-labelledby="action-title">
      <h2 id="action-title" className="card-title">GitHub Action: Mutation, Vision and Snapshots</h2>
      <p className="card-subtitle">These three run your code, so they run in your own GitHub Actions and report here.</p>
      <ol className="steps-list">
        <li>
          Create an engine key and save it in <strong>{repo?.full_name ?? 'your repository'}</strong> → Settings → Secrets and variables → Actions as <code>VIBEASSIST_KEY</code>.
          <div className="page-actions" style={{ marginTop: 6 }}>
            {engineKey && !newKey && <span className="field-help">Current key {engineKey.key_prefix}… · {engineKey.last_used_at ? `last report ${since(engineKey.last_used_at)}` : 'no reports yet'}</span>}
            {engineKey
              ? <ConfirmButton label="Replace key" question="Replace the key? Workflows using the old one stop reporting until you update the secret." busyLabel="Creating…" onConfirm={createKey} />
              : <button type="button" className="btn btn-primary btn-sm" onClick={createKey}>Create engine key</button>}
          </div>
          {newKey && (
            <div style={{ marginTop: 8 }}>
              <Notice tone="warning" title="Copy your key now. It won't be shown again.">
                <div className="key-row"><code>{newKey}</code><button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(newKey, 'Key')}><Copy aria-hidden="true" /> Copy</button></div>
              </Notice>
            </div>
          )}
        </li>
        <li>
          Publish the action from this project's <code>github-action/</code> folder as a public repository (for example <code>you/vibeassist-engine</code>, tagged <code>v1</code>).
        </li>
        <li>
          Add this workflow as <code>.github/workflows/vibeassist.yml</code>, replacing <code>OWNER</code>:
          <pre className="code-block">{WORKFLOW}</pre>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(WORKFLOW, 'Workflow')}><Copy aria-hidden="true" /> Copy workflow</button>
        </li>
        <li>
          Optional, on your computer: a pre-commit secret scan and local checkpoints with <code>sh vibeassist-engine/hooks/install.sh</code> (or <code>hooks/install.ps1</code> on Windows).
        </li>
      </ol>
    </section>
  );
}
