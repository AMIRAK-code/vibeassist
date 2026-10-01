import React from 'react';

export default function FullPageSpinner() {
  return (
    <div className="flex-center" style={{ minHeight: '100vh' }} role="status" aria-label="Loading">
      <div className="spinner" />
    </div>
  );
}
