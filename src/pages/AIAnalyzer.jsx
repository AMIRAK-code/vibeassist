import React, { useState } from 'react';
import { Cpu, Send, Sparkles, TrendingUp, DollarSign, BrainCircuit } from 'lucide-react';

export default function AIAnalyzer() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Hello! I am your AI Business Advisor. Describe your app idea or paste your current metrics, and I will mathematically and economically analyze it to maximize your profit.' }
  ]);

  const handleSend = () => {
    if (!query) return;
    const newMsg = { role: 'user', content: query };
    setMessages([...messages, newMsg]);
    setQuery('');
    
    // Mock AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: `Based on economic modeling and standard conversion rates (approx 2.5% for this sector), your business plan needs a slight pivot. \n\nRecommendation: \n1. Introduce a $4.99/mo premium tier. \n2. Reduce ad-spend on Twitter, focus 80% on TikTok ads where CPA is currently $0.45 lower. \n3. Projected profit increase: +22% in Q3.`
      }]);
    }, 1500);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="mb-4">
        <h2><span className="text-gradient">AI</span> Business & Profit Analyzer</h2>
        <p className="input-label mt-4">Personalized recommendations driven by deep market models.</p>
      </div>

      <div className="grid-3 mb-4">
        <div className="glass-panel flex-center gap-4">
          <BrainCircuit className="text-gradient" size={32} />
          <div>
            <h4>Non-AI Math Model</h4>
            <p className="input-label" style={{ fontSize: '0.8rem' }}>Deterministic forecasting</p>
          </div>
        </div>
        <div className="glass-panel flex-center gap-4">
          <TrendingUp className="text-gradient" size={32} />
          <div>
            <h4>Growth Engine</h4>
            <p className="input-label" style={{ fontSize: '0.8rem' }}>LTV / CAC Optimization</p>
          </div>
        </div>
        <div className="glass-panel flex-center gap-4">
          <DollarSign className="text-gradient" size={32} />
          <div>
            <h4>Pricing Strategy</h4>
            <p className="input-label" style={{ fontSize: '0.8rem' }}>Elasticity analysis</p>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ 
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
              padding: '12px 16px',
              borderRadius: '12px',
              maxWidth: '80%',
              lineHeight: '1.5'
            }}>
              {msg.role === 'system' && <Sparkles size={14} style={{ display: 'inline', marginRight: '8px', color: 'var(--accent-2)' }} />}
              {msg.content}
            </div>
          ))}
        </div>
        
        <div className="input-group" style={{ flexDirection: 'row', marginBottom: 0, marginTop: '16px' }}>
          <input 
            type="text" 
            className="input-field" 
            style={{ flex: 1 }}
            placeholder="E.g. Analyze my pricing model for a new developer tool..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button className="btn btn-primary" onClick={handleSend}>
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
