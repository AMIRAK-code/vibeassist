import React from 'react';

// Keeps the app shell usable when a page fails to load (a dropped connection, or a new
// version deployed since this tab opened) or crashes while rendering.
export default class PageErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card empty-state" role="alert">
        <h2>This page didn't load</h2>
        <p>Your data is safe. The connection may have dropped, or the app was updated since you opened this tab. Reloading fixes both.</p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
