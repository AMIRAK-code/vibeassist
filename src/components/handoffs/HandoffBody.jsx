import React from 'react';
import { handoffBlocks } from '../../lib/handoffs';

// A handoff's sections as headings, paragraphs, lists and code. Text only: nothing in a
// handoff is ever rendered as HTML.
export default function HandoffBody({ sections, headingLevel = 'h4' }) {
  const Heading = headingLevel;
  return (
    <div className="legal-body handoff-body">
      {sections.map((s) => (
        <section key={`${s.key}-${s.heading}`}>
          <Heading>{s.heading}</Heading>
          {s.body.trim()
            ? handoffBlocks(s.body).map((b, i) => {
              if (b.type === 'code') return <pre key={i} className="code-block"><code>{b.text}</code></pre>;
              if (b.type === 'ul') return <ul key={i}>{b.items.map((item, j) => <li key={j}>{item}</li>)}</ul>;
              return <p key={i}>{b.text}</p>;
            })
            : <p className="muted">Nothing yet.</p>}
        </section>
      ))}
    </div>
  );
}
