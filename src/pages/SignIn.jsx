import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import BrandMark from '../components/landing/BrandMark';
import Notice from '../components/ui/Notice';

const SIGN_IN_ERRORS = {
  invalid_credentials: "That email and password don't match an account. Check both, or reset your password below.",
  email_not_confirmed: 'Confirm your email first: open the link we sent when you signed up, then sign in here.',
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
  const [busy, setBusy] = useState('');

  useEffect(() => {
    document.title = 'Sign in · VibeAssist';
  }, []);

  if (!loading && user) return <Navigate to={from} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    setBusy('signin');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // On success the redirect above takes over once the account has loaded
    if (signInError) {
      setBusy('');
      setError(SIGN_IN_ERRORS[signInError.code] ?? `${signInError.message} Try again in a moment.`);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter your email above first, then choose “Forgot password?”.');
      return;
    }
    setBusy('reset');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy('');
    if (resetError) setError(`${resetError.message} Try again in a minute.`);
    else setNotice(`If ${email.trim()} has an account, a reset link is on its way. It works once and expires after a while.`);
  };

  return (
    <main className="auth-page">
      <form className="card card--raised auth-card" onSubmit={handleSubmit} noValidate>
        <Link to="/" className="auth-brand"><BrandMark /> VibeAssist</Link>
        <h1>Sign in</h1>
        <p className="lead">Pick up where you left off.</p>

        <div className="field">
          <label className="field-label" htmlFor="signin-email">Email</label>
          <input id="signin-email" type="email" className="input-field" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="signin-password">Password</label>
          <input id="signin-password" type="password" className="input-field" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <div style={{ marginBottom: 14 }}><Notice tone="error">{error}</Notice></div>}
        {notice && <div style={{ marginBottom: 14 }}><Notice tone="success">{notice}</Notice></div>}

        <button type="submit" className="btn btn-primary w-full" disabled={Boolean(busy)} aria-busy={busy === 'signin'}>
          {busy === 'signin' ? <><span className="spinner spinner--light" /> Signing in…</> : 'Sign in'}
        </button>
        <div className="flex-between" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleForgotPassword} disabled={Boolean(busy)}>
            {busy === 'reset' ? 'Sending…' : 'Forgot password?'}
          </button>
          <Link to="/onboarding" style={{ fontSize: 14, fontWeight: 600 }}>Create an account</Link>
        </div>
      </form>
    </main>
  );
}
