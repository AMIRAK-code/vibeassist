import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { authMessage, clearAuthLinkError, isValidEmail, pendingAuthLinkError } from '../lib/authErrors';
import { useAuth } from '../context/auth';
import BrandMark from '../components/landing/BrandMark';
import Notice from '../components/ui/Notice';

export default function SignIn() {
  const { user, loading } = useAuth();
  const location = useLocation();
  // Return to the page the visitor originally asked for
  const from = location.state?.from?.pathname ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null); // { text, resend? }
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [linkError] = useState(() => location.state?.linkError ?? pendingAuthLinkError());

  useEffect(() => {
    document.title = 'Sign in · VibeAssist';
    return clearAuthLinkError;
  }, []);

  if (!loading && user) return <Navigate to={from} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice('');
    setBusy('signin');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // On success the redirect above takes over once the account has loaded
    if (signInError) {
      setBusy('');
      setError({ text: authMessage(signInError, 'Could not sign in. Try again in a moment.'), resend: signInError.code === 'email_not_confirmed' });
    }
  };

  const needEmail = (action) => {
    if (isValidEmail(email)) return false;
    setError({ text: `Enter your email above first, then choose “${action}”.` });
    return true;
  };

  const sendReset = async () => {
    setError(null);
    setNotice('');
    if (needEmail('Forgot password?')) return;
    setBusy('reset');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy('');
    if (resetError) setError({ text: authMessage(resetError, 'Could not send the email. Try again in a minute.') });
    else setNotice(`If ${email.trim()} has an account, a reset link is on its way. It works once and expires after an hour.`);
  };

  const resendConfirmation = async () => {
    setError(null);
    setNotice('');
    if (needEmail('Send a new confirmation link')) return;
    setBusy('resend');
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setBusy('');
    if (resendError) setError({ text: authMessage(resendError, 'Could not send the email. Try again in a minute.') });
    else setNotice(`Sent a new confirmation link to ${email.trim()}. It can take a minute to arrive; check your spam folder too.`);
  };

  const resendButton = (
    <button type="button" className="btn btn-secondary btn-sm" onClick={resendConfirmation} disabled={Boolean(busy)} aria-busy={busy === 'resend'}>
      {busy === 'resend' ? 'Sending…' : 'Send a new confirmation link'}
    </button>
  );

  return (
    <main className="auth-page">
      <form className="card card--raised auth-card" onSubmit={handleSubmit} noValidate>
        <Link to="/" className="auth-brand"><BrandMark /> VibeAssist</Link>
        <h1>Sign in</h1>
        <p className="lead">Pick up where you left off.</p>

        {linkError && !notice && (
          <div style={{ marginBottom: 14 }}>
            <Notice
              tone="warning"
              title={linkError.kind === 'reset' ? 'That reset link has expired' : 'That confirmation link has expired'}
              actions={linkError.kind === 'signup' ? resendButton : null}
            >
              {linkError.kind === 'reset'
                ? 'Links work once and only for an hour. Enter your email below and choose “Forgot password?” for a new one.'
                : 'Links work once and only for a limited time. Enter your email below and we’ll send a new one.'}
            </Notice>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="signin-email">Email</label>
          <input id="signin-email" type="email" className="input-field" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="signin-password">Password</label>
          <input id="signin-password" type="password" className="input-field" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <div style={{ marginBottom: 14 }}><Notice tone="error" actions={error.resend ? resendButton : null}>{error.text}</Notice></div>}
        {notice && <div style={{ marginBottom: 14 }}><Notice tone="success">{notice}</Notice></div>}

        <button type="submit" className="btn btn-primary w-full" disabled={Boolean(busy)} aria-busy={busy === 'signin'}>
          {busy === 'signin' ? <><span className="spinner spinner--light" /> Signing in…</> : 'Sign in'}
        </button>
        <div className="flex-between" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={sendReset} disabled={Boolean(busy)}>
            {busy === 'reset' ? 'Sending…' : 'Forgot password?'}
          </button>
          <Link to="/onboarding" style={{ fontSize: 14, fontWeight: 600 }}>Create an account</Link>
        </div>
      </form>
    </main>
  );
}
