import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './ui/PageHeader';

const FEATURES = {
  plan: {
    title: 'Plan',
    what: 'Get a short weekly plan from your own numbers: three to five concrete steps, each showing the figures it is based on. Keep the steps you want and tick them off during the week.',
    path: '/plan',
  },
  campaigns: {
    title: 'Campaigns',
    what: 'Track spend, revenue and installs for each ad campaign, and compare return on ad spend and cost per install across Meta, Google, TikTok and the rest.',
    path: '/campaigns',
  },
  'data-sources': {
    title: 'Data sources',
    what: 'Import daily revenue, refunds and fees from Stripe, or send numbers from your own apps with an API key, instead of typing them in.',
    path: '/data-sources',
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
          Everything else, including the overview, manual entry, launch guides and news, stays free.
        </p>
        <div className="page-actions" style={{ marginTop: 18 }}>
          <Link className="btn btn-primary" to={`/premium?from=${encodeURIComponent(info.path)}`}>See Premium plans</Link>
          <Link className="btn btn-secondary" to="/dashboard">Back to Overview</Link>
        </div>
      </div>
    </>
  );
}
