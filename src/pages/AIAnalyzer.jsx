import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, TrendingUp, DollarSign, BrainCircuit, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/auth';
import { callFunction } from '../lib/supabase';

// Opening message, tailored with the answers saved during onboarding
const greetingFor = (profile) => {
  const name = profile?.name ? ` ${profile.name}` : '';
  const goals = profile?.goals.length ? `, goals: ${profile.goals.join(', ')}` : '';
  const context = profile ? ` I'll tailor my advice to your profile (${profile.experience} level, ${profile.profit_expectancy}/month target${goals}) and the numbers on your dashboard.` : '';
  return `Hello${name}! I am your AI Business Advisor.${context} Ask me about pricing, growth, ads or anything else about your apps.`;
};

// Only the conversation itself goes to the advisor: the greeting and error notices stay local
const toHistory = (messages) =>
  messages
    .filter((m) => m.role === 'user' || m.role === 'system')
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

export default function AIAnalyzer() {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState(() => [
    { role: 'system', content: greetingFor(profile) }
  ]);
  const messagesRef = useRef(null);

  // Keep the newest message in view
  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, pending]);

  const handleSend = async () => {
    const text = query.trim();
    if (!text || pending) return;
    const conversation = [...messages, { role: 'user', content: text }];
    setMessages(conversation);
    setQuery('');
    setPending(true);

    const { data, status } = await callFunction('ai-advisor', { messages: toHistory(conversation) });
    setPending(false);

    if (status === 200) {
      setMessages(prev => [...prev, { role: 'system', content: data.reply }]);
    } else if (data?.error === 'not_configured') {
      setMessages(prev => [...prev, {
        role: 'error',
        content: `The AI advisor isn't switched on yet: add the ANTHROPIC_API_KEY secret to the Supabase project.\n\nMeanwhile, ${data.summary}`,
      }]);
    } else {
      setMessages(prev => [...prev, { role: 'error', content: data?.error ?? 'The advisor could not answer. Try again.' }]);
    }
  };

  return (
    // Fill the viewport (minus .main-content's 40px top/bottom padding) so the message list scrolls instead of growing the page
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      <div className="mb-4">
        <h2><span className="text-gradient">AI</span> Business & Profit Analyzer</h2>
        <p className="input-label mt-4">Personalized recommendations from Claude, grounded in your own profile, metrics and campaigns.</p>
      </div>

      <div className="grid-3 mb-4">
        <div className="glass-panel flex-center gap-4">
          <BrainCircuit className="text-gradient" size={32} />
          <div>
            <h4>Your Real Numbers</h4>
            <p className="input-label" style={{ fontSize: '0.8rem' }}>Last 90 days of metrics</p>
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
        <div ref={messagesRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg, i) => (
            <div key={i} role={msg.role === 'error' ? 'alert' : undefined} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? 'var(--accent-gradient)' : msg.role === 'error' ? 'rgba(217, 48, 37, 0.08)' : 'rgba(255,255,255,0.05)',
              color: msg.role === 'error' ? '#a8261c' : undefined,
              padding: '12px 16px',
              borderRadius: '12px',
              maxWidth: '80%',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.role === 'system' && <Sparkles size={14} style={{ display: 'inline', marginRight: '8px', color: 'var(--accent-2)' }} />}
              {msg.role === 'error' && <AlertTriangle size={14} style={{ display: 'inline', marginRight: '8px' }} />}
              {msg.content}
            </div>
          ))}
          {pending && (
            <div role="status" className="input-label" style={{ alignSelf: 'flex-start', padding: '12px 16px' }}>
              <Sparkles size={14} style={{ display: 'inline', marginRight: '8px', color: 'var(--accent-2)' }} />
              Looking at your numbers…
            </div>
          )}
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
            aria-label="Ask the advisor"
            maxLength={4000}
          />
          <button className="btn btn-primary" onClick={handleSend} disabled={pending} aria-label="Send">

            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
