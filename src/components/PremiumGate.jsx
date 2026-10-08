import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './ui/PageHeader';

const FEATURES = {
  'ai-analyzer': {
    title: 'AI Business Analyzer',
    what: 'See cost per install, revenue per user, payback and lifetime value worked out from your numbers, check how buyers reacted to price changes, and chat with Claude about your last 90 days.',
    path: '/ai-analyzer',
  },
  plan: {
    title: 'Weekly Plan',
    what: 'Get a short weekly plan from your own numbers: three to five concrete steps, each showing the figures it is based on. Keep the steps you want and tick them off during the week.',
    path: '/plan',
  },
  ads: {
    title: 'Ad Manager',
    what: 'Track spend, revenue and installs for each ad campaign, and compare return on ad spend and cost per install across Meta, Google, TikTok and the rest.',
    path: '/ads',
  },
  integrations: {
    title: 'Integrations',
    what: 'Import daily revenue, refunds and fees from Stripe, or send numbers from your own apps with an API key, instead of typing them in.',
    path: '/integrations',
  },
};

export default function PremiumGate({ feature }) {
  const info = FEATURES[feature];
  return (
    <>
      <PageHeader title={info.title} />
      <div className="card card--raised" style={{ maxWidth: 620 }}>
        <span className="badge badge--cobalt">Premium</span>
        <p style={{ marginTop: 12, fontSize: 15 }}>{info.what}</p>
        <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
          Overall Income, manual entry, Legal & Publishing guides and News & Newsletter stay free.
        </p>
        <div className="page-actions" style={{ marginTop: 18 }}>
          <Link className="btn btn-primary" to={`/premium?from=${encodeURIComponent(info.path)}`}>See Premium plans</Link>
          <Link className="btn btn-secondary" to="/dashboard">Back to Overall Income</Link>
        </div>
      </div>
    </>
  );
}
