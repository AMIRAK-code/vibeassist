import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { PASSWORD_HINT, validatePassword } from '../lib/password';
import { authMessage, isValidEmail } from '../lib/authErrors';
import BrandMark from '../components/landing/BrandMark';
import Notice from '../components/ui/Notice';

// One short form: an account is all that's needed to start. Profile questions are asked later,
// where they're used (the weekly plan) and can be changed any time in Settings.
export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [signupError, setSignupError] = useState('');
  const [signingUp, setSigningUp] = useState(false);

  useEffect(() => {
    document.title = 'Create your account · VibeAssist';
  }, []);

  // Already signed in: nothing to set up
  if (user && !signingUp) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (signingUp) return;
    const next = {};
    if (!isValidEmail(form.email)) next.email = 'Enter the email address you want to sign in with.';
    const passwordError = validatePassword(form.password);
    if (passwordError) next.password = passwordError;
    setErrors(next);
    if (Object.keys(next).length) return;

    setSigningUp(true);
    setSignupError('');
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { name: form.name.trim() } },
    });

    if (error) {
      setSigningUp(false);
      setSignupError(`${authMessage(error, 'Could not create your account.')} Your details are still filled in.`);
      return;
    }
    if (data.session) {
      navigate('/dashboard', { replace: true });
    } else {
      // No session means Supabase still requires email confirmation, which this app no longer uses
      setSigningUp(false);
      setSignupError('Your account was created, but we could not sign you in. Sign in to continue.');
    }
  };

  return (
    <main className="auth-page">
      <form className="card card--raised auth-card" onSubmit={handleSubmit} noValidate>
        <Link to="/" className="auth-brand"><BrandMark /> VibeAssist</Link>
        <h1>Create your account</h1>
        <p className="lead">Track revenue, downloads and ad spend for your apps in one place. Free to start; no card needed.</p>

        <div className="field">
          <label className="field-label" htmlFor="signup-name">Name <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
          <input id="signup-name" className="input-field" autoComplete="name" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            type="email"
            className="input-field"
            autoComplete="email"
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'signup-email-error' : undefined}
            value={form.email}
            onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: undefined }); }}
          />
          {errors.email && <span id="signup-email-error" className="field-error">{errors.email}</span>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="signup-password">Password</label>
          <div className="password-row">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              className="input-field"
              autoComplete="new-password"
              required
              aria-invalid={Boolean(errors.password)}
              aria-describedby="signup-password-help"
              value={form.password}
              onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors({ ...errors, password: undefined }); }}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPassword((s) => !s)} aria-pressed={showPassword}>
              {showPassword ? 'Hide' : 'Show'}<span className="visually-hidden"> password</span>
            </button>
          </div>
          <span id="signup-password-help" className={errors.password ? 'field-error' : 'field-help'}>{errors.password ?? PASSWORD_HINT}</span>
        </div>

        {signupError && (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="error" actions={signupError.includes('Sign in') ? <Link to="/signin" className="btn btn-secondary btn-sm">Go to sign in</Link> : null}>
              {signupError}
            </Notice>
          </div>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={signingUp} aria-busy={signingUp}>
          {signingUp ? <><span className="spinner spinner--light" /> Creating your account…</> : 'Create account'}
        </button>
        <p className="auth-footer">Already have an account? <Link to="/signin">Sign in</Link></p>
        <p className="field-help" style={{ marginTop: 12, textAlign: 'center' }}>
          By creating an account you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy policy</Link>.
        </p>
      </form>
    </main>
  );
}
