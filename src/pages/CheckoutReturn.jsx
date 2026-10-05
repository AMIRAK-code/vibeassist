import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ListChecks, Megaphone, Plug } from 'lucide-react';
import { syncBilling } from '../lib/billing';
import { useAuth } from '../context/auth';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';

const NEXT = [
  { to: '/plan', icon: ListChecks, title: 'Write your first plan', text: 'Claude reads your numbers and suggests three to five steps for this week.' },
  { to: '/data-sources', icon: Plug, title: 'Import from Stripe', text: 'Pull in 90 days of revenue so the plan has real numbers to work with.' },
  { to: '/campaigns', icon: Megaphone, title: 'Track a campaign', text: 'See which ads pay for themselves.' },
];
const RETRIES = 5; // card payments usually confirm within a few seconds

// Stripe sends people here after paying. The webhook normally switches Premium on first;
// asking Stripe directly covers the case where it hasn't arrived yet.
export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  // A different checkout starts a fresh check
  return <CheckoutStatus key={sessionId ?? 'none'} sessionId={sessionId} />;
}

function CheckoutStatus({ sessionId }) {
  const { refreshAccount } = useAuth();
  const [state, setState] = useState(sessionId ? 'checking' : 'missing'); // checking | done | pending | unfinished | error | missing
  const [error, setError] = useState('');
  const alive = useRef(true);
  const timer = useRef(null);

  // Asks a few times, two seconds apart, before saying it's still pending
  const check = useCallback(async () => {
    for (let attempt = 1; ; attempt++) {
      const result = await syncBilling(sessionId);
      if (!alive.current) return;
      if (result.error) {
        setError(result.error);
        setState('error');
        return;
      }
      await refreshAccount();
      if (result.subscription?.plan === 'premium') return setState('done');
      if (result.checkout?.status === 'open') return setState('unfinished');
      if (attempt >= RETRIES) return setState('pending');
      await new Promise((resolve) => { timer.current = setTimeout(resolve, 2000); });
    }
  }, [sessionId, refreshAccount]);

  useEffect(() => {
    alive.current = true;
    if (sessionId) check();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, [sessionId, check]);

  const retry = () => {
    setState('checking');
    check();
  };

  if (state === 'checking') {
    return (
      <>
        <PageHeader title="Confirming your payment" />
        <div className="card empty-state" role="status"><span className="spinner" /> Checking with Stripe. This usually takes a few seconds.</div>
      </>
    );
  }

  if (state !== 'done') {
    const messages = {
      pending: ['Your payment is still being confirmed', "Stripe hasn't confirmed it yet. Some payment methods take a few minutes; Premium switches on by itself as soon as it does, and you'll get a receipt by email."],
      unfinished: ["Checkout wasn't finished", "You weren't charged. Go back to the plans page to try again."],
      error: ["We couldn't confirm your payment", `${error} If you were charged, Premium will still switch on; check again in a minute.`],
      missing: ['Nothing to confirm', 'This page is opened by Stripe after checkout. To upgrade, choose a plan first.'],
    };
    const [title, text] = messages[state];
    return (
      <>
        <PageHeader title={title} />
        <Notice
          tone={state === 'error' ? 'error' : state === 'pending' ? 'info' : 'warning'}
          actions={<>
            {(state === 'pending' || state === 'error') && <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>Check again</button>}
            <Link to="/premium" className="btn btn-ghost btn-sm">See plans</Link>
          </>}
        >
          {text}
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Premium is on" description="Thanks for subscribing. Your receipt is on its way from Stripe, and you can manage billing any time in Settings." />
      <div className="notice notice--success" style={{ marginBottom: 20 }}>
        <CheckCircle2 aria-hidden="true" />
        <div>Everything is unlocked: plans, imports and campaign tracking.</div>
      </div>
      <h2>Where to start</h2>
      <div className="start-options">
        {NEXT.map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="start-option" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Icon aria-hidden="true" />
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
