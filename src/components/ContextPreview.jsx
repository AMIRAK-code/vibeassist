import React from 'react';
import { Link } from 'react-router-dom';
import { SOURCE_LABELS } from '../lib/metrics';
import { formatCount, formatMoney } from '../lib/format';
import { experienceLabel, profitLabel } from '../lib/options';

// Exactly what goes to Claude with a plan request or a question, so nothing is a surprise
export default function ContextPreview({ profile, summary, campaigns, period, open = false }) {
  const { current, sources } = summary;
  const currency = profile?.currency ?? 'USD';
  return (
    <details className="context-preview" open={open}>
      <summary>What Claude will see</summary>
      <dl>
        <div><dt>Numbers</dt><dd>
          Last {period} days and the {period} before. This period: {formatMoney(current.revenue, currency)} revenue, {formatCount(current.downloads)} downloads,
          {' '}{formatMoney(current.adSpend, currency)} ad spend ({current.daysWithData} days with data).
        </dd></div>
        <div><dt>Sources</dt><dd>{sources.length ? sources.map((s) => SOURCE_LABELS[s] ?? s).join(', ') : 'none yet'}</dd></div>
        <div><dt>Campaigns</dt><dd>{campaigns} tracked</dd></div>
        <div><dt>About you</dt><dd>
          {experienceLabel(profile?.experience)}; target {profitLabel(profile?.profit_expectancy)};
          {' '}goals: {profile?.goals?.length ? profile.goals.join(', ') : 'none set'}. <Link to="/settings">Edit</Link>
        </dd></div>
      </dl>
      <p className="field-help">
        Sent to Anthropic's Claude only when you ask for a plan or ask a question. Your email and Stripe keys are never included.
      </p>
    </details>
  );
}
