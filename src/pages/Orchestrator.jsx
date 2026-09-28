import React, { useState } from 'react';
import { ShieldCheck, Activity, BrainCircuit, GitCommit, SearchCode, Database, Eye } from 'lucide-react';

export default function Orchestrator() {
  const [activeModule, setActiveModule] = useState(1);

  const modules = [
    { id: 1, title: 'Red Team Agents', icon: <BrainCircuit size={20} />, desc: 'Adversarial Review Sub-Agents (Security & Architecture)' },
    { id: 2, title: 'Pre-Flight Scanner', icon: <SearchCode size={20} />, desc: 'Automated Vibe Diagnosis & Security Guardrails' },
    { id: 3, title: 'Context & Drift', icon: <Database size={20} />, desc: 'Modular Context Management & Drift Watch' },
    { id: 4, title: 'Mutation Validator', icon: <Activity size={20} />, desc: 'Anti-Tautological Testing (Detecting fake passing tests)' },
    { id: 5, title: 'Vision Grounding', icon: <Eye size={20} />, desc: 'Playwright + VLM visual layout testing loop' },
    { id: 6, title: 'Snapshot Engine', icon: <GitCommit size={20} />, desc: 'State Rewind & Strict Checkpointing (Git hooks)' },
    { id: 7, title: 'Smart Token Gateway', icon: <ShieldCheck size={20} />, desc: 'LLM Routing & Rate Limit Fallbacks' }
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="mb-4">
        <h2><span className="text-gradient">Anti-Fragile</span> Vibe Orchestrator</h2>
        <p className="input-label mt-4">Premium Service: Intelligent orchestration layer preventing architectural collapse and security vulnerabilities.</p>
      </div>

      <div className="grid-2 gap-4" style={{ flex: 1, minHeight: '500px' }}>
        
        {/* Left Column: Module Selection */}
        <div className="glass-panel flex-column gap-2" style={{ padding: '24px' }}>
          <h3 className="mb-4">System Modules</h3>
          {modules.map(mod => (
            <div 
              key={mod.id} 
              className={`glass-panel flex-center gap-4 ${activeModule === mod.id ? 'active' : ''}`}
              style={{ 
                justifyContent: 'flex-start', 
                cursor: 'pointer', 
                border: activeModule === mod.id ? '1px solid var(--accent-2)' : '1px solid var(--panel-border)',
                background: activeModule === mod.id ? 'rgba(0, 240, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                padding: '16px'
              }}
              onClick={() => setActiveModule(mod.id)}
            >
              <div style={{ color: activeModule === mod.id ? 'var(--accent-2)' : 'var(--text-secondary)' }}>
                {mod.icon}
              </div>
              <div>
                <h4 style={{ color: activeModule === mod.id ? 'white' : 'var(--text-secondary)' }}>{mod.title}</h4>
                <p className="input-label" style={{ fontSize: '0.8rem', marginTop: '4px' }}>{mod.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Status & Simulation (Phase 1 Mock) */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--panel-border)' }}>
            <h3 className="text-gradient">Engine Status: Initializing Phase 1</h3>
            <p className="input-label mt-2">Architecture scaffolding and schema generation active.</p>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', fontFamily: 'monospace', fontSize: '0.85rem', color: '#00f0ff' }}>
            {activeModule === 1 && (
              <div className="animate-fade-in">
                <p>{'>'} SPWNING: BuilderAgent (Primary)</p>
                <p>{'>'} SPWNING: SecurityAgent (Adversarial) [ISOLATED]</p>
                <p>{'>'} SPWNING: ArchitectureAgent (Adversarial) [ISOLATED]</p>
                <p>{'>'} STATUS: Waiting for code generation event...</p>
              </div>
            )}
            {activeModule === 6 && (
              <div className="animate-fade-in">
                <p>{'>'} MOUNTING: Git-wrapper hook</p>
                <p>{'>'} REPOSITORY: Shadow branch active (vibe-shadow-001)</p>
                <p>{'>'} STATUS: Ready for state rewind requests...</p>
              </div>
            )}
            {activeModule !== 1 && activeModule !== 6 && (
              <div className="animate-fade-in">
                <p>{'>'} MODULE ID: {activeModule}</p>
                <p>{'>'} STATUS: API Endpoints scaffolded. Awaiting Phase 2-4 implementations.</p>
                <p>{'>'} SYSTEM: Please approve Phase 1 architecture to proceed.</p>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px', display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary" style={{ flex: 1 }}>Run Backtest Simulator</button>
            <button className="btn btn-secondary" style={{ flex: 1 }}>View API Specs</button>
          </div>
        </div>

      </div>
    </div>
  );
}
