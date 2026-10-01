import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Code, Lock, MailCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { EXPERIENCE_OPTIONS, GOALS, PROFIT_OPTIONS } from '../lib/options';
import { PASSWORD_HINT, validatePassword } from '../lib/password';

export default function Onboarding() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '', age: '',
    goals: [], experience: 'Beginner', profitExpectancy: '$0 - $1,000',
    email: '', password: ''
  });

  const [passwordError, setPasswordError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [signupError, setSignupError] = useState('');
  const [confirmationSentTo, setConfirmationSentTo] = useState('');
  const [loading, setLoading] = useState(false);
  // Set while this page is creating the account, so the redirect below doesn't race it
  const [signingUp, setSigningUp] = useState(false);
  const navigate = useNavigate();

  // Already signed in: nothing to set up
  if (user && !signingUp) return <Navigate to="/dashboard" replace />;

  const handleNext = () => {
    if (step === 3) {
      if (!/^\S+@\S+\.\S+$/.test(formData.email.trim())) {
        setEmailError('Enter a valid email address. You will use it to sign in.');
        return;
      }
      const error = validatePassword(formData.password);
      if (error) {
        setPasswordError(error);
        return;
      }
      setPasswordError('');
      handleSignUp();
    } else {
      setStep(step + 1);
    }
  };

  const handleSignUp = async () => {
    setSigningUp(true);
    setLoading(true);
    setSignupError('');
    // The answers travel as user metadata; a database trigger turns them into the profile row
    const { data, error } = await supabase.auth.signUp({
      email: formData.email.trim(),
      password: formData.password,
      options: {
        emailRedirectTo: `${window.location.origin}/premium`,
        data: {
          name: formData.name.trim(),
          age: formData.age,
          goals: formData.goals,
          experience: formData.experience,
          profit_expectancy: formData.profitExpectancy,
        },
      },
    });
    setLoading(false);

    if (error) {
      setSigningUp(false);
      setSignupError(error.code === 'user_already_exists' ? 'An account with this email already exists. Sign in instead.' : error.message);
      return;
    }
    if (data.session) {
      navigate('/premium'); // Must show paywall next
    } else {
      // Email confirmation is on: the link in the email signs them in and opens the paywall
      setSigningUp(false);
      setConfirmationSentTo(formData.email.trim());
    }
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

  if (confirmationSentTo) {
    return (
      <div className="flex-center animate-fade-in" style={{ minHeight: '100vh', padding: '24px' }}>
        <div className="glass-panel text-center" style={{ maxWidth: '480px' }}>
          <MailCheck className="text-gradient" size={48} style={{ margin: '0 auto 16px' }} />
          <h2>Check your inbox</h2>
          <p className="input-label mt-4">
            We sent a confirmation link to <strong>{confirmationSentTo}</strong>. Open it to finish creating your account.
          </p>
          <Link to="/signin" className="btn btn-secondary mt-4" style={{ textDecoration: 'none' }}>I've confirmed, sign me in</Link>
        </div>
      </div>
    );
  }

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
                {GOALS.map(goal => (
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
                  {EXPERIENCE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Profit Expectancy (Monthly)</label>
                <select 
                  className="input-field" 
                  value={formData.profitExpectancy} 
                  onChange={(e) => setFormData({...formData, profitExpectancy: e.target.value})}
                >
                  {PROFIT_OPTIONS.map(option => <option key={option}>{option}</option>)}
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
              <label className="input-label" htmlFor="signup-email">Email Address</label>
              <input
                id="signup-email"
                type="email"
                className="input-field"
                placeholder="hello@vibecoder.com"
                autoComplete="email"
                aria-invalid={Boolean(emailError)}
                value={formData.email}
                onChange={(e) => {
                  setFormData({...formData, email: e.target.value});
                  setEmailError('');
                }}
              />
              {emailError && <span style={{ color: '#ff5f56', fontSize: '0.8rem', marginTop: '4px' }}>{emailError}</span>}
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="input-field"
                  autoComplete="new-password"
                  aria-label="Password"
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
              <span className="input-label" style={{ fontSize: '0.8rem', marginTop: '4px' }}>{PASSWORD_HINT}</span>
            </div>
            {signupError && (
              <p role="alert" style={{ color: '#d93025', fontSize: '0.9rem' }}>
                {signupError} {signupError.includes('Sign in') && <Link to="/signin" style={{ color: 'var(--accent-1)' }}>Go to sign in</Link>}
              </p>
            )}
            <button className="btn btn-primary w-full mt-4" onClick={handleNext} disabled={loading || !formData.password}>
              {loading ? (
                <span>Creating your account…</span>
              ) : (
                <><Sparkles size={18} /> Create Account</>
              )}
            </button>
          </div>
        )}

        <p className="input-label text-center mt-4" style={{ fontSize: '0.9rem' }}>
          Already have an account? <Link to="/signin" style={{ color: 'var(--accent-1)' }}>Sign in</Link>
        </p>

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
