import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { PASSWORD_HINT, validatePassword } from '../lib/password';
import { useToast } from '../components/ui/toast-context';
import BrandMark from '../components/landing/BrandMark';
import FullPageSpinner from '../components/FullPageSpinner';
import Notice from '../components/ui/Notice';

// Opened from the reset email: Supabase signs the visitor in from the link,
// so all that is left is choosing a new password.
export default function ResetPassword() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Choose a new password · VibeAssist';
  }, []);

  if (loading) return <FullPageSpinner />;

  if (!user) {
    return (
      <main className="auth-page">
        <div className="card card--raised auth-card">
          <Link to="/" className="auth-brand"><BrandMark /> VibeAssist</Link>
          <h1>This link has expired</h1>
          <p className="lead">Reset links work once and only for a short time. Request a new one from the sign-in page.</p>
          <Link to="/signin" className="btn btn-primary">Back to sign in</Link>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(`${updateError.message} Your new password is still in the box; try again.`);
      return;
    }
    toast.show({ message: 'Password changed.' });
    navigate('/dashboard', { replace: true });
  };

  return (
    <main className="auth-page">
      <form className="card card--raised auth-card" onSubmit={handleSubmit} noValidate>
        <Link to="/" className="auth-brand"><BrandMark /> VibeAssist</Link>
        <h1>Choose a new password</h1>
        <p className="lead">For {user.email}</p>
        <div className="field">
          <label className="field-label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            className="input-field"
            autoComplete="new-password"
            aria-invalid={Boolean(error)}
            aria-describedby="new-password-help"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
          />
          <span id="new-password-help" className="field-help">{PASSWORD_HINT}</span>
        </div>
        {error && <div style={{ marginBottom: 14 }}><Notice tone="error">{error}</Notice></div>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !password} aria-busy={busy}>
          {busy ? <><span className="spinner spinner--light" /> Saving…</> : 'Save new password'}
        </button>
      </form>
    </main>
  );
}
