import React from 'react';
import { Link } from 'react-router-dom';
import { Cpu, HardDrive, Plus } from 'lucide-react';
import { AI_PROVIDERS, useImportedAi } from '../lib/aiClient';

export default function ModelSelectorPill({ feature = 'default', hasPremium = false, allowCloud = true }) {
  const { models, routing, active, setFeatureTarget } = useImportedAi(feature);
  const currentValue = routing?.[feature] && routing[feature] !== 'inherit'
    ? routing[feature]
    : (active ? active.id : 'cloud');
  const isLocal = Boolean(active && AI_PROVIDERS[active.provider]?.local);

  return (
    <div className="ai-pill-bar" role="region" aria-label="AI Engine selector">
      <div className="ai-pill-status">
        {isLocal ? <HardDrive aria-hidden="true" className="ai-pill-icon" /> : <Cpu aria-hidden="true" className="ai-pill-icon" />}
        <span className="ai-pill-label">
          {active ? (
            <>
              <strong>{active.label}</strong>
              <span> · {active.defaultModel}{isLocal ? ' (Local)' : ' (Your key)'}</span>
            </>
          ) : (
            <>
              <strong>VibeAssist Cloud</strong>
              <span> · {hasPremium ? 'Claude (shared Premium pool)' : 'Configure your own AI key or upgrade'}</span>
            </>
          )}
        </span>
      </div>

      <div className="ai-pill-controls">
        <label className="visually-hidden" htmlFor={`ai-select-${feature}`}>Select AI model</label>
        <select
          id={`ai-select-${feature}`}
          className="input-field input-sm"
          value={currentValue}
          onChange={(e) => setFeatureTarget(e.target.value)}
        >
          {allowCloud && (
            <option value="cloud">
              {hasPremium ? 'VibeAssist Cloud (Claude)' : 'VibeAssist Cloud (Premium)'}
            </option>
          )}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · {m.defaultModel} {AI_PROVIDERS[m.provider]?.local ? '(Local)' : '(BYOK)'}
            </option>
          ))}
        </select>
        <Link to="/ai-models" className="btn btn-secondary btn-sm">
          <Plus aria-hidden="true" /> Import AI
        </Link>
      </div>
    </div>
  );
}
