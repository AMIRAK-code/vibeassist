import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/auth';
import { PASSWORD_HINT, validatePassword } from '../lib/password';
import FullPageSpinner from '../components/FullPageSpinner';

// Opened from the reset email: Supabase signs the visitor in from the link,
// so all that is left is choosing a new password.
export default function ResetPassword() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <FullPageSpinner />;

  if (!user) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', padding: '24px' }}>
        <div className="glass-panel text-center" style={{ maxWidth: '440px' }}>
          <h2>This link has expired</h2>
          <p className="input-label mt-4">Reset links work once and only for a short time. Request a new one from the sign-in page.</p>
          <Link to="/signin" className="btn btn-primary mt-4" style={{ textDecoration: 'none' }}>Back to sign in</Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(updateError.message);
    else navigate('/dashboard', { replace: true });
  };

  return (
    <div className="flex-center animate-fade-in" style={{ minHeight: '100vh', padding: '24px' }}>
      <form className="glass-panel" style={{ maxWidth: '440px', width: '100%' }} onSubmit={handleSubmit}>
        <div className="text-center mb-4">
          <KeyRound className="text-gradient" size={48} style={{ margin: '0 auto 16px' }} />
          <h2>Choose a new password</h2>
          <p className="input-label mt-4">For {user.email}</p>
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            className="input-field"
            autoComplete="new-password"
            aria-invalid={Boolean(error)}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
          />
          {error && <span role="alert" style={{ color: '#d93025', fontSize: '0.8rem' }}>{error}</span>}
          <span className="input-label" style={{ fontSize: '0.8rem' }}>{PASSWORD_HINT}</span>
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !password}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}
