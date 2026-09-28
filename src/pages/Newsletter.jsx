import React from 'react';
import { Newspaper, ArrowRight, Hash, MessageSquare, ExternalLink } from 'lucide-react';

export default function Newsletter() {
  const communityLinks = [
    {
      title: 'X.com (Twitter) Vibe Coding Thread',
      platform: 'X.com',
      icon: <Hash size={20} color="#fff" />,
      desc: 'The ultimate mega-thread on setting up your dev environment for 10x output using AI agents.',
      url: '#'
    },
    {
      title: 'Reddit r/indiehackers Discussion',
      platform: 'Reddit',
      icon: <MessageSquare size={20} color="#FF4500" />,
      desc: 'How developers are pivoting to vibe-coding to launch 3 micro-SaaS products a month.',
      url: '#'
    },
    {
      title: 'Hacker News: The death of manual typing?',
      platform: 'Hacker News',
      icon: <ExternalLink size={20} color="#FF6600" />,
      desc: 'Top discussion of the week regarding the shift towards AI-assisted architecture vs traditional coding.',
      url: '#'
    }
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="mb-4">
        <h2>Vibecoding <span className="text-gradient">News & Community</span></h2>
        <p className="input-label mt-4">Stay ahead of the curve. Latest news on AI, platform rules, and vibecoding strategies.</p>
      </div>

      <div className="grid-2 gap-4" style={{ flex: 1, minHeight: '500px' }}>
        
        {/* Left Column: Live Search Iframe */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.02)' }}>
            <h3 style={{ fontSize: '1.1rem' }}>Live AI News Feed (Bing Search)</h3>
          </div>
          <iframe 
            src="https://www.bing.com/news/search?q=Artificial+Intelligence+Coding" 
            style={{ width: '100%', flex: 1, border: 'none', background: '#fff' }}
            title="AI News"
          />
        </div>

        {/* Right Column: Community Threads */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div className="glass-panel" style={{ background: 'var(--accent-gradient)', border: 'none' }}>
            <h3 style={{ color: 'white' }}>Subscribe to the Weekly Vibe</h3>
            <p style={{ color: 'rgba(255,255,255,0.9)', marginTop: '8px', fontSize: '0.9rem' }}>Get the best growth hacks and API changes straight to your inbox.</p>
            <div className="input-group" style={{ flexDirection: 'row', marginTop: '16px' }}>
              <input type="email" className="input-field" placeholder="your@email.com" style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)' }} />
              <button className="btn" style={{ background: 'white', color: '#000' }}>Subscribe</button>
            </div>
          </div>

          <h3 className="mt-4 mb-2">Trending Community Threads</h3>
          
          {communityLinks.map((link, i) => (
            <div key={i} className="glass-panel flex-column gap-2" style={{ cursor: 'pointer', padding: '16px 24px' }}>
              <div className="flex-between">
                <div className="flex-center gap-4">
                  {link.icon}
                  <span className="input-label" style={{ fontWeight: 'bold' }}>{link.platform}</span>
                </div>
              </div>
              <h4 style={{ marginTop: '8px' }}>{link.title}</h4>
              <p className="input-label" style={{ fontSize: '0.9rem' }}>{link.desc}</p>
              <div className="flex-center mt-2" style={{ justifyContent: 'flex-start', color: 'var(--accent-2)', fontSize: '0.9rem', fontWeight: 'bold' }}>
                View Thread <ArrowRight size={16} style={{ marginLeft: '4px' }} />
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
