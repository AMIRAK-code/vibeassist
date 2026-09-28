import React from 'react';
import { ShieldAlert, BookOpen, Apple, Monitor, Smartphone, TerminalSquare, ArrowRight } from 'lucide-react';

export default function PublishingGuide() {
  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h2><span className="text-gradient">Publishing</span> & Legal Center</h2>
        <p className="input-label mt-4">Master the rules of the tech world. Navigate app stores, legalities, and monetization compliance effortlessly.</p>
      </div>

      <div className="grid-2 mt-4">
        
        {/* Apple iOS */}
        <div className="glass-panel">
          <div className="flex-center gap-4" style={{ justifyContent: 'flex-start' }}>
            <Apple size={32} />
            <h3>iOS & App Store</h3>
          </div>
          <p className="input-label mt-4">Guidelines for App Store Review, privacy manifests, ATT (App Tracking Transparency), and in-app purchase rules (30% cut).</p>
          <button className="btn btn-secondary w-full mt-4">Read iOS Guide <ArrowRight size={16} /></button>
        </div>

        {/* Android */}
        <div className="glass-panel">
          <div className="flex-center gap-4" style={{ justifyContent: 'flex-start' }}>
            <Smartphone size={32} color="#3DDC84" />
            <h3>Android & Play Store</h3>
          </div>
          <p className="input-label mt-4">Google Play Policies, 20-tester requirement for new devs, billing library implementation, and data safety forms.</p>
          <button className="btn btn-secondary w-full mt-4">Read Android Guide <ArrowRight size={16} /></button>
        </div>

        {/* Windows */}
        <div className="glass-panel">
          <div className="flex-center gap-4" style={{ justifyContent: 'flex-start' }}>
            <Monitor size={32} color="#00a4ef" />
            <h3>Windows (MS Store)</h3>
          </div>
          <p className="input-label mt-4">MSIX packaging, code signing certificates (EV/Standard), Windows Defender SmartScreen filtering.</p>
          <button className="btn btn-secondary w-full mt-4">Read Windows Guide <ArrowRight size={16} /></button>
        </div>

        {/* Linux / Web */}
        <div className="glass-panel">
          <div className="flex-center gap-4" style={{ justifyContent: 'flex-start' }}>
            <TerminalSquare size={32} color="#FCC624" />
            <h3>Linux & Web (SaaS)</h3>
          </div>
          <p className="input-label mt-4">GDPR & CCPA compliance, cookie banners, Stripe Tax / VAT collection, and open-source licensing (MIT/GPL).</p>
          <button className="btn btn-secondary w-full mt-4">Read Web/Linux Guide <ArrowRight size={16} /></button>
        </div>

      </div>

      <div className="glass-panel mt-4" style={{ background: 'rgba(255, 46, 147, 0.05)', borderColor: 'rgba(255, 46, 147, 0.2)' }}>
        <div className="flex-center gap-4" style={{ justifyContent: 'flex-start' }}>
          <ShieldAlert className="text-gradient" size={24} />
          <h3>Legal Document Generator</h3>
        </div>
        <p className="input-label mt-4">Automatically generate Privacy Policies, Terms of Service, and EULAs tailored to your exact tech stack and monetization model.</p>
        <button className="btn btn-primary mt-4">Generate Documents</button>
      </div>

    </div>
  );
}
