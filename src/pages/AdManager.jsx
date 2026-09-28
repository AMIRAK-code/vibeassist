import React from 'react';
import { Megaphone, Target, BarChart2, Hash, Maximize, PlayCircle, Youtube } from 'lucide-react';

export default function AdManager() {
  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h2>Centralized <span className="text-gradient">Ad Manager</span></h2>
        <p className="input-label mt-4">Manage, track, and optimize campaigns across Meta, Google, YouTube, X, Apple Search Ads, and TikTok from one dashboard.</p>
      </div>

      <div className="grid-3 mt-4">
        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Total Ad Spend</h4>
            <Target className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '1.8rem' }}>$4,250.00</h2>
          <p style={{ color: '#00d2ff', fontSize: '0.8rem', marginTop: '8px' }}>This month</p>
        </div>

        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Avg. ROAS</h4>
            <BarChart2 className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '1.8rem' }}>285%</h2>
          <p style={{ color: '#3DDC84', fontSize: '0.8rem', marginTop: '8px' }}>Healthy</p>
        </div>

        <div className="glass-panel">
          <div className="flex-between">
            <h4 className="input-label">Avg. CAC</h4>
            <Maximize className="text-gradient" size={20} />
          </div>
          <h2 className="mt-4" style={{ fontSize: '1.8rem' }}>$1.85</h2>
          <p style={{ color: '#ff2e93', fontSize: '0.8rem', marginTop: '8px' }}>Target: $1.50</p>
        </div>
      </div>

      <h3 className="mt-4 mb-4">Connected Ad Networks</h3>
      
      <div className="flex-column gap-4">
        
        {/* YouTube Ads */}
        <div className="glass-panel flex-between" style={{ padding: '16px 24px' }}>
          <div className="flex-center gap-4">
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FF0000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Youtube color="#fff" />
            </div>
            <div>
              <h4>YouTube Ads</h4>
              <p className="input-label" style={{ fontSize: '0.8rem' }}>Active • Spend: $550</p>
            </div>
          </div>
          <button className="btn btn-secondary">Manage</button>
        </div>

        {/* TikTok Ads */}
        <div className="glass-panel flex-between" style={{ padding: '16px 24px' }}>
          <div className="flex-center gap-4">
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#000', border: '1px solid #00f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlayCircle color="#00f0ff" />
            </div>
            <div>
              <h4>TikTok For Business</h4>
              <p className="input-label" style={{ fontSize: '0.8rem' }}>Active • Spend: $1,200</p>
            </div>
          </div>
          <button className="btn btn-secondary">Manage</button>
        </div>

        {/* Meta Ads */}
        <div className="glass-panel flex-between" style={{ padding: '16px 24px' }}>
          <div className="flex-center gap-4">
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#0866FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.2rem' }}>f</span>
            </div>
            <div>
              <h4>Meta (Facebook/Instagram)</h4>
              <p className="input-label" style={{ fontSize: '0.8rem' }}>Active • Spend: $2,500</p>
            </div>
          </div>
          <button className="btn btn-secondary">Manage</button>
        </div>

        {/* X Ads */}
        <div className="glass-panel flex-between" style={{ padding: '16px 24px' }}>
          <div className="flex-center gap-4">
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#000', border: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Hash color="#fff" />
            </div>
            <div>
              <h4>X.com (Twitter) Ads</h4>
              <p className="input-label" style={{ fontSize: '0.8rem' }}>Paused • Spend: $0</p>
            </div>
          </div>
          <button className="btn btn-primary">Connect</button>
        </div>

      </div>
    </div>
  );
}
