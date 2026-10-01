import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Code, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';

const SIGN_IN_ERRORS = {
  invalid_credentials: "That email and password don't match an account.",
  email_not_confirmed: 'Confirm your email first. Check your inbox for the link we sent when you signed up.',
};

export default function SignIn() {
  const { user, loading } = useAuth();
  const location = useLocation();
  // Return to the page the visitor originally asked for
  const from = location.state?.from?.pathname ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={from} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // On success the redirect above takes over once the account has loaded
    if (signInError) {
      setBusy(false);
      setError(SIGN_IN_ERRORS[signInError.code] ?? signInError.message);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your email above, then choose "Forgot password?" again.');
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (resetError) setError(resetError.message);
    else setNotice('If that email has an account, a reset link is on its way.');
  };

  return (
    <div className="flex-center animate-fade-in" style={{ minHeight: '100vh', padding: '24px' }}>
      <form className="glass-panel" style={{ maxWidth: '440px', width: '100%' }} onSubmit={handleSubmit}>
        <div className="text-center mb-4">
          <Code className="text-gradient" size={48} style={{ margin: '0 auto 16px' }} />
          <h2>Welcome back</h2>
          <p className="input-label mt-4">Sign in to see your numbers.</p>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="signin-email">Email address</label>
          <input
            id="signin-email"
            type="email"
            className="input-field"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="signin-password">Password</label>
          <input
            id="signin-password"
            type="password"
            className="input-field"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p role="alert" style={{ color: '#d93025', fontSize: '0.9rem', marginBottom: '12px' }}>{error}</p>}
        {notice && <p role="status" style={{ color: 'var(--accent-1)', fontSize: '0.9rem', marginBottom: '12px' }}>{notice}</p>}

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : <><LogIn size={18} /> Sign in</>}
        </button>

        <div className="flex-between mt-4" style={{ fontSize: '0.9rem' }}>
          <button type="button" className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem' }} onClick={handleForgotPassword}>
            Forgot password?
          </button>
          <Link to="/onboarding" style={{ color: 'var(--accent-1)' }}>Create an account</Link>
        </div>
      </form>
    </div>
  );
}
