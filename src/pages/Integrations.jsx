import React from 'react';
import { Play, AppWindow, Apple, CreditCard, CheckCircle2 } from 'lucide-react';

// Connection state lives in App so it survives navigating away from this page
export default function Integrations({ connections, onToggle }) {
  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h2><span className="text-gradient">Integrations</span> & Data Sources</h2>
        <p className="input-label mt-4">Connect your developer consoles to track sales and conversions.</p>
      </div>

      <div className="grid-2 mt-4">
        
        {/* Google Play Console */}
        <div className="glass-panel">
          <div className="flex-between">
            <div className="flex-center gap-4">
              <Play size={32} color="#00f0ff" />
              <div>
                <h3>Google Play Console</h3>
                <p className="input-label" style={{ fontSize: '0.8rem' }}>Android App Data</p>
              </div>
            </div>
            {connections.google ? <CheckCircle2 color="#00f0ff" /> : null}
          </div>
          <p className="mt-4 input-label">Import downloads, uninstalls, crash rates, and in-app purchases.</p>
          <button 
            className={`btn w-full mt-4 ${connections.google ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => onToggle('google')}
          >
            {connections.google ? 'Disconnect' : 'Connect Account'}
          </button>
        </div>

        {/* Apple App Store Connect */}
        <div className="glass-panel">
          <div className="flex-between">
            <div className="flex-center gap-4">
              <Apple size={32} color="#fff" />
              <div>
                <h3>Apple Developer</h3>
                <p className="input-label" style={{ fontSize: '0.8rem' }}>iOS App Data</p>
              </div>
            </div>
            {connections.apple ? <CheckCircle2 color="#fff" /> : null}
          </div>
          <p className="mt-4 input-label">Sync App Store sales, subscription retention, and impressions.</p>
          <button 
            className={`btn w-full mt-4 ${connections.apple ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => onToggle('apple')}
          >
            {connections.apple ? 'Disconnect' : 'Connect Account'}
          </button>
        </div>

        {/* Stripe */}
        <div className="glass-panel">
          <div className="flex-between">
            <div className="flex-center gap-4">
              <CreditCard size={32} color="#6772E5" />
              <div>
                <h3>Stripe</h3>
                <p className="input-label" style={{ fontSize: '0.8rem' }}>Web Payments</p>
              </div>
            </div>
            {connections.stripe ? <CheckCircle2 color="#6772E5" /> : null}
          </div>
          <p className="mt-4 input-label">Track web app revenue, MRR, churn rate, and failed payments.</p>
          <button 
            className={`btn w-full mt-4 ${connections.stripe ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => onToggle('stripe')}
          >
            {connections.stripe ? 'Disconnect' : 'Connect Account'}
          </button>
        </div>

        {/* Custom Web / PC */}
        <div className="glass-panel">
          <div className="flex-between">
            <div className="flex-center gap-4">
              <AppWindow size={32} color="#ff2e93" />
              <div>
                <h3>Custom API (Web/PC)</h3>
                <p className="input-label" style={{ fontSize: '0.8rem' }}>Custom Software Data</p>
              </div>
            </div>
            {connections.custom ? <CheckCircle2 color="#ff2e93" /> : null}
          </div>
          <p className="mt-4 input-label">Send custom events from PC apps or web apps using our SDK.</p>
          <button 
            className={`btn w-full mt-4 ${connections.custom ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => onToggle('custom')}
          >
            {connections.custom ? 'Revoke API Key' : 'Generate API Key'}
          </button>
        </div>

      </div>
    </div>
  );
}
