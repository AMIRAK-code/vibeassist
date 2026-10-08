import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { callFunction } from '../lib/supabase';
import BrandMark from '../components/landing/BrandMark';
import Notice from '../components/ui/Notice';

// Pages the links in Weekly Vibe emails open. The action only happens when the person presses
// the button, because mail scanners open links on their own.
function LinkPage({ title, intro, action, param, buttonLabel, doneTitle, doneText }) {
  const [params] = useSearchParams();
  const token = params.get(param) ?? '';
  const [state, setState] = useState('idle'); // idle | busy | done | error
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = `${title} · VibeAssist`;
  }, [title]);

  const run = async () => {
    setState('busy');
    const { data, status } = await callFunction('newsletter', { action, token });
    if (status !== 200) {
      setError(data?.error ?? 'Something went wrong. Try again.');
      setState('error');
      return;
    }
    setState('done');
  };

  return (
    <main className="auth-page">
      <div className="card card--raised auth-card">
        <Link to="/" className="app-brand" aria-label="VibeAssist home"><BrandMark /> VibeAssist</Link>
        <h1 style={{ marginTop: 16 }}>{state === 'done' ? doneTitle : title}</h1>
        {state === 'done' ? (
          <p className="lead">{doneText}</p>
        ) : !token ? (
          <Notice tone="error">This link is incomplete. Open it again from the email.</Notice>
        ) : (
          <>
            <p className="lead">{intro}</p>
            {state === 'error' && <div style={{ margin: '12px 0' }}><Notice tone="error">{error}</Notice></div>}
            <button type="button" className="btn btn-primary" onClick={run} disabled={state === 'busy'} aria-busy={state === 'busy'} style={{ marginTop: 12 }}>
              {state === 'busy' ? 'One moment…' : buttonLabel}
            </button>
          </>
        )}
        <p className="field-help" style={{ marginTop: 16 }}><Link to="/newsletter">News & Newsletter</Link> · <Link to="/settings#newsletter">Email settings</Link></p>
      </div>
    </main>
  );
}

export function NewsletterConfirm() {
  return (
    <LinkPage
      title="Confirm your subscription"
      intro="Press the button to start getting the Weekly Vibe every Monday."
      action="confirm"
      param="token"
      buttonLabel="Confirm subscription"
      doneTitle="You're subscribed"
      doneText="The first Weekly Vibe arrives next Monday morning. You can change or stop it from Settings or from any email."
    />
  );
}

export function NewsletterUnsubscribe() {
  return (
    <LinkPage
      title="Unsubscribe from the Weekly Vibe"
      intro="Press the button and we'll stop sending the Weekly Vibe to this address."
      action="unsubscribe"
      param="t"
      buttonLabel="Unsubscribe"
      doneTitle="You're unsubscribed"
      doneText="No more Weekly Vibe emails. If you change your mind, subscribe again from News & Newsletter."
    />
  );
}
