import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Code, Lock } from 'lucide-react';

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ 
    name: '', age: '', 
    goals: [], experience: 'Beginner', profitExpectancy: '$0 - $1,000',
    email: '', password: '' 
  });
  
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleNext = () => {
    if (step === 3) {
      // Password restraints validation
      if (formData.password.length < 8) {
        setPasswordError('Password must be at least 8 characters long.');
        return;
      }
      if (!/\d/.test(formData.password)) {
        setPasswordError('Password must contain at least one number.');
        return;
      }
      if (!/[A-Z]/.test(formData.password)) {
        setPasswordError('Password must contain at least one uppercase letter.');
        return;
      }
      setPasswordError('');
      handleSignUp();
    } else {
      setStep(step + 1);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    // Simulate database signup and saving profile data
    setTimeout(() => {
      setLoading(false);
      // Hand every answer except the password to the app's shared profile
      const { name, age, goals, experience, profitExpectancy, email } = formData;
      onComplete({ name: name.trim(), age, goals, experience, profitExpectancy, email: email.trim() }); // Tells app we are authenticated
      navigate('/premium'); // Must show paywall next
    }, 1500);
  };

  const toggleGoal = (goal) => {
    setFormData(prev => {
      if (prev.goals.includes(goal)) {
        return { ...prev, goals: prev.goals.filter(g => g !== goal) };
      } else {
        return { ...prev, goals: [...prev.goals, goal] };
      }
    });
  };

  const goalsList = [
    "Build a SaaS Empire",
    "Develop Viral Mobile Games",
    "Generate Passive Income",
    "Automate Workflows with AI",
    "Freelance App Development",
    "Sell Micro-tools"
  ];

  return (
    <div className="flex-center animate-fade-in" style={{ minHeight: '100vh', padding: '24px', background: 'radial-gradient(circle at 50% 0%, rgba(255, 46, 147, 0.1), transparent 50%)' }}>
      <div className="glass-panel" style={{ maxWidth: '600px', width: '100%', position: 'relative' }}>
        
        <div className="text-center mb-4">
          <Code className="text-gradient" size={48} style={{ margin: '0 auto 16px' }} />
          <h2>Welcome to <span className="text-gradient">VibeAssist</span></h2>
          <p className="input-label mt-4">Let's set up your profile so our AI can tailor your business plan perfectly.</p>
        </div>

        {step === 1 && (
          <div className="animate-fade-in">
            <h3 className="mb-4">Step 1: Basics (Optional)</h3>
            <div className="input-group">
              <label className="input-label">What's your name? (Optional)</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Indie Hacker..."
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="input-group">
              <label className="input-label">How old are you? (Optional)</label>
              <input 
                type="number" 
                className="input-field" 
                placeholder="18"
                value={formData.age}
                onChange={(e) => setFormData({...formData, age: e.target.value})}
              />
            </div>
            <button className="btn btn-primary w-full mt-4" onClick={handleNext}>
              Continue <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in">
            <h3 className="mb-4">Step 2: Your Developer Profile</h3>
            
            <div className="input-group mb-4">
              <label className="input-label mb-4" style={{ display: 'block' }}>What are your main app making goals?</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {goalsList.map(goal => (
                  <label key={goal} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: formData.goals.includes(goal) ? '1px solid var(--accent-2)' : '1px solid transparent' }}>
                    <input 
                      type="checkbox" 
                      checked={formData.goals.includes(goal)} 
                      onChange={() => toggleGoal(goal)} 
                      style={{ accentColor: 'var(--accent-2)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '0.9rem' }}>{goal}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="grid-2">
              <div className="input-group">
                <label className="input-label">Profession Level</label>
                <select 
                  className="input-field" 
                  value={formData.experience} 
                  onChange={(e) => setFormData({...formData, experience: e.target.value})}
                >
                  <option value="Beginner">Beginner (Vibe Coder)</option>
                  <option value="Intermediate">Intermediate (Some apps built)</option>
                  <option value="Pro">Pro (Full time indie)</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Profit Expectancy (Monthly)</label>
                <select 
                  className="input-field" 
                  value={formData.profitExpectancy} 
                  onChange={(e) => setFormData({...formData, profitExpectancy: e.target.value})}
                >
                  <option>$0 - $1,000</option>
                  <option>$1,000 - $10,000</option>
                  <option>$10k - $50k</option>
                  <option>$50k+</option>
                </select>
              </div>
            </div>

            <button className="btn btn-primary w-full mt-4" onClick={handleNext}>
              Continue <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fade-in">
            <h3 className="mb-4">Step 3: Secure your account</h3>
            <div className="input-group">
              <label className="input-label">Email Address (Optional if skipping save)</label>
              <input 
                type="email" 
                className="input-field" 
                placeholder="hello@vibecoder.com"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="password" 
                  className="input-field" 
                  style={{ width: '100%', paddingLeft: '40px' }}
                  aria-invalid={Boolean(passwordError)}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({...formData, password: e.target.value});
                    setPasswordError('');
                  }}
                />
                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              </div>
              {passwordError && <span style={{ color: '#ff5f56', fontSize: '0.8rem', marginTop: '4px' }}>{passwordError}</span>}
              <span className="input-label" style={{ fontSize: '0.8rem', marginTop: '4px' }}>Must be 8+ characters, contain 1 number and 1 uppercase letter.</span>
            </div>
            <button className="btn btn-primary w-full mt-4" onClick={handleNext} disabled={loading || !formData.password}>
              {loading ? (
                <span>Creating Account & Database Profile...</span>
              ) : (
                <><Sparkles size={18} /> Create Account</>
              )}
            </button>
          </div>
        )}

        {/* Progress indicators */}
        <div className="flex-center mt-8 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} style={{ 
              width: step === i ? '24px' : '8px', 
              height: '8px', 
              borderRadius: '4px', 
              background: step >= i ? 'var(--accent-2)' : 'rgba(255,255,255,0.2)',
              transition: 'var(--transition)'
            }} />
          ))}
        </div>

      </div>
    </div>
  );
}
