import React, { useState } from 'react';

// Inline "are you sure" for actions that can't be undone from here
export default function ConfirmButton({ label, question, busyLabel, busy, onConfirm, disabled }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className="btn btn-ghost" onClick={() => setAsking(true)} disabled={disabled}>{label}</button>;
  }
  return (
    <span className="inline-confirm" role="group" aria-label={question}>
      {question}
      <button type="button" className="btn btn-danger btn-sm" onClick={async () => { await onConfirm(); setAsking(false); }} disabled={busy}>
        {busy ? busyLabel : label}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
    </span>
  );
}
