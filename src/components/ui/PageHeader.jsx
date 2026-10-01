import React, { useEffect } from 'react';

// Title, one line of explanation and the page's actions. Also sets the document title.
export default function PageHeader({ title, description, children }) {
  useEffect(() => {
    document.title = `${title} · VibeAssist`;
  }, [title]);

  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
