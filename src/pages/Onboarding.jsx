import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { leakedPasswordError, PASSWORD_HINT, validatePassword } from '../lib/password';
import { authMessage, isValidEmail } from '../lib/authErrors';
import { EXPERIENCE_OPTIONS, GOALS, PROFIT_OPTIONS } from '../lib/options';
import BrandMark from '../components/landing/BrandMark';
import Notice from '../components/ui/Notice';

const STEPS = ['Basics', 'Your developer profile', 'Secure your account'];

// Three short steps, as in the original: who you are (optional), what you're aiming for (so the
// advisor can tailor plans), then the account itself. Everything except the password can be
// changed later in Settings.
export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '', age: '', goals: [], experience: 'Beginner', profit: '$0 - $1,000', email: '', password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [signupError, setSignupError] = useState('');
  const [signingUp, setSigningUp] = useState(false);
  const heading = useRef(null);

  useEffect(() => {
    document.title = 'Create your account · VibeAssist';
  }, []);

  // Each step moves focus to its heading, so screen readers hear where they are
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  // Already signed in: nothing to set up
  if (user && !signingUp) return <Navigate to="/dashboard" replace />;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleGoal = (goal) => set({ goals: form.goals.includes(goal) ? form.goals.filter((g) => g !== goal) : [...form.goals, goal] });

  const next = (e) => {
    e.preventDefault();
    if (step === 0 && form.age !== '') {
      const age = Number(form.age);
      if (!Number.isInteger(age) || age < 13 || age > 120) {
        setErrors({ age: 'Use a whole number between 13 and 120, or leave it empty.' });
        return;
      }
    }
    setErrors({});
    setStep((s) => s + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (signingUp) return;
    const found = {};
    if (!isValidEmail(form.email)) found.email = 'Enter the email address you want to sign in with.';
    const passwordError = validatePassword(form.password);
    if (passwordError) found.password = passwordError;
    setErrors(found);
    if (Object.keys(found).length) return;

    setSigningUp(true);
    setSignupError('');
    const leaked = await leakedPasswordError(form.password);
    if (leaked) {
      setSigningUp(false);
      setErrors({ password: leaked });
      return;
    }
    // The sign-up trigger copies these answers into the new profile
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          name: form.name.trim(),
          age: form.age === '' ? null : Number(form.age),
          goals: form.goals,
          experience: form.experience,
          profit_expectancy: form.profit,
        },
      },
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
      <form className="card card--raised auth-card onboarding-card" onSubmit={step < 2 ? next : handleSubmit} noValidate>
        <Link to="/" className="auth-brand"><BrandMark /> VibeAssist</Link>
        <h1>Welcome to VibeAssist</h1>
        <p className="lead">Let's set up your profile so the AI can tailor your business plan. Free to start; no card needed.</p>

        <ol className="step-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="visually-hidden">{label}{i < step ? ' (done)' : ''}</span>
            </li>
          ))}
        </ol>

        <h2 className="onboarding-step" ref={heading} tabIndex={-1}>
          Step {step + 1}: {STEPS[step]}{step === 0 && <span className="muted" style={{ fontWeight: 400 }}> (optional)</span>}
        </h2>

        {step === 0 && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="signup-name">What's your name?</label>
              <input id="signup-name" className="input-field" autoComplete="name" maxLength={80} placeholder="Indie Hacker…" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="signup-age">How old are you?</label>
              <input
                id="signup-age"
                type="number"
                inputMode="numeric"
                min="13"
                max="120"
                className="input-field"
                value={form.age}
                onChange={(e) => { set({ age: e.target.value }); setErrors({}); }}
                aria-invalid={Boolean(errors.age)}
                aria-describedby={errors.age ? 'signup-age-error' : undefined}
              />
              {errors.age && <span id="signup-age-error" className="field-error">{errors.age}</span>}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <fieldset className="field legal-checks">
              <legend className="field-label">What are your main app-making goals?</legend>
              <div className="goal-grid">
                {GOALS.map((goal) => (
                  <label key={goal} className={`goal-option${form.goals.includes(goal) ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={form.goals.includes(goal)} onChange={() => toggleGoal(goal)} /> {goal}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label className="field-label" htmlFor="signup-experience">Profession level</label>
              <select id="signup-experience" className="input-field" value={form.experience} onChange={(e) => set({ experience: e.target.value })}>
                {EXPERIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="signup-profit">Profit expectancy (monthly)</label>
              <select id="signup-profit" className="input-field" value={form.profit} onChange={(e) => set({ profit: e.target.value })}>
                {PROFIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                className="input-field"
                autoComplete="email"
                required
                placeholder="hello@vibecoder.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'signup-email-error' : undefined}
                value={form.email}
                onChange={(e) => { set({ email: e.target.value }); setErrors({ ...errors, email: undefined }); }}
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
                  onChange={(e) => { set({ password: e.target.value }); setErrors({ ...errors, password: undefined }); }}
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
          </>
        )}

        <div className="onboarding-actions">
          {step > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => { setErrors({}); setStep((s) => s - 1); }} disabled={signingUp}>
              <ArrowLeft aria-hidden="true" /> Back
            </button>
          )}
          {step < 2 ? (
            <button type="submit" className="btn btn-primary">Continue <ArrowRight aria-hidden="true" /></button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={signingUp} aria-busy={signingUp}>
              {signingUp ? <><span className="spinner spinner--light" /> Creating your account…</> : 'Create account'}
            </button>
          )}
        </div>

        <p className="auth-footer">Already have an account? <Link to="/signin">Sign in</Link></p>
        <p className="field-help" style={{ marginTop: 12, textAlign: 'center' }}>
          By creating an account you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy policy</Link>.
        </p>
      </form>
    </main>
  );
}
