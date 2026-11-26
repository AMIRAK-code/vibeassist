import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';

const COMMANDS = [
  { to: '/dashboard', label: 'Overall Income', group: 'Core', keywords: 'revenue profit dashboard income' },
  { to: '/ai-models', label: 'Import Your AI (Gemini, Claude, OpenAI, Ollama)', group: 'AI', keywords: 'byok gemini claude openai ollama lmstudio local models api key' },
  { to: '/integrations', label: 'Connections & CSV Data Hub', group: 'Data', keywords: 'stripe app store google play csv custom api ingest' },
  { to: '/publishing?tab=checklists', label: 'Store & AI Launch Checklists', group: 'Compliance', keywords: 'ios android windows macos checklist launch' },
  { to: '/publishing?tab=legal', label: 'Legal Document Studio (7 Docs)', group: 'Compliance', keywords: 'privacy policy terms eula dpa cookie ai policy refunds' },
  { to: '/publishing?tab=manifests', label: 'Apple Privacy Manifest & Play Data Safety', group: 'Compliance', keywords: 'xcprivacy apple play safety' },
  { to: '/publishing?tab=security', label: 'Security Lab (Secrets, CVE & Headers)', group: 'Security', keywords: 'secret leak scan osv cve csp headers rls' },
  { to: '/ai-analyzer', label: 'AI Business Analyzer & Simulator', group: 'AI', keywords: 'ltv cac pricing what if simulator' },
  { to: '/plan', label: 'Weekly Plan', group: 'AI', keywords: 'weekly steps goals' },
  { to: '/ads', label: 'Ad Manager', group: 'Growth', keywords: 'roas meta google tiktok apple search ads' },
  { to: '/handoffs', label: 'Context Handoffs', group: 'AI', keywords: 'chat export claude chatgpt cursor' },
  { to: '/newsletter', label: 'News & Community', group: 'Community', keywords: 'hacker news reddit weekly vibe' },
  { to: '/orchestrator', label: 'Anti-Fragile Engine & Smart Gateway', group: 'Security', keywords: 'github red team drift gateway' },
  { to: '/settings', label: 'Settings & Workspace Backup', group: 'Account', keywords: 'export backup profile billing appearance' },
];

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { inputRef.current?.focus(); }, 0);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => `${c.label} ${c.group} ${c.keywords}`.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;

  const go = (to) => {
    setQuery('');
    onClose();
    navigate(to);
  };

  return (
    <div className="cmd-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cmd-dialog card card--raised"
        role="dialog"
        aria-modal="true"
        aria-label="Quick navigation"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmd-head">
          <Search aria-hidden="true" />
          <label className="visually-hidden" htmlFor="cmd-search">Jump to a section</label>
          <input
            id="cmd-search"
            ref={inputRef}
            className="cmd-input"
            placeholder="Type a section, model, or security tool…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) go(matches[0].to);
            }}
          />
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </div>
        <ul className="cmd-list">
          {matches.length === 0 ? (
            <li className="field-help" style={{ padding: 14 }}>No matching sections.</li>
          ) : (
            matches.map((item) => (
              <li key={item.to}>
                <button type="button" onClick={() => go(item.to)}>
                  <span>{item.label}</span>
                  <span className="badge">{item.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
