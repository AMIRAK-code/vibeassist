import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

const ICONS = { info: Info, warning: AlertTriangle, error: XCircle, success: CheckCircle2 };

// Inline message tied to the content it explains. Errors are announced immediately; warnings
// that appear after an action (such as a save conflict) are announced politely.
export default function Notice({ tone = 'info', title, children, actions }) {
  const Icon = ICONS[tone];
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : tone === 'warning' ? 'status' : undefined}>
      <Icon aria-hidden="true" />
      <div>
        {title && <p style={{ fontWeight: 600 }}>{title}</p>}
        {children && <div>{children}</div>}
        {actions && <div className="notice-actions">{actions}</div>}
      </div>
    </div>
  );
}
