import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { PASSWORD_HINT, validatePassword } from '../lib/password';
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
  const [confirmationSentTo, setConfirmationSentTo] = useState('');
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
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter the email address you want to sign in with.';
    const passwordError = validatePassword(form.password);
    if (passwordError) next.password = passwordError;
    setErrors(next);
    if (Object.keys(next).length) return;

    setSigningUp(true);
    setSignupError('');
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { name: form.name.trim() },
      },
    });

    if (error) {
      setSigningUp(false);
      setSignupError(error.code === 'user_already_exists'
        ? 'An account with this email already exists. Sign in instead, or reset your password from the sign-in page.'
        : `${error.message} Your details are still filled in; try again.`);
      return;
    }
    if (data.session) {
      navigate('/dashboard', { replace: true });
    } else {
      // Email confirmation is on: the link in the email signs them in
      setSigningUp(false);
      setConfirmationSentTo(form.email.trim());
    }
  };

  if (confirmationSentTo) {
    return (
      <main className="auth-page">
        <div className="card card--raised auth-card text-center">
          <MailCheck aria-hidden="true" style={{ width: 36, height: 36, color: 'var(--ci-cobalt)', margin: '0 auto 12px' }} />
          <h1>Check your inbox</h1>
          <p className="lead">
            We sent a confirmation link to <strong>{confirmationSentTo}</strong>. Open it on this device to finish creating your account.
          </p>
          <p className="field-help">Nothing after a few minutes? Check your spam folder, or <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmationSentTo('')}>use a different email</button>.</p>
          <Link to="/signin" className="btn btn-secondary" style={{ marginTop: 16 }}>I've confirmed, sign me in</Link>
        </div>
      </main>
    );
  }

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
      </form>
    </main>
  );
}
