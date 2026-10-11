import React from 'react';
import { BrandIdentity } from './BrandIdentity';

export class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean; error: Error | null }
> {
  state: { failed: boolean; error: Error | null } = { failed: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { failed: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('Page failed to render', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="p-6 space-y-3">
          <BrandIdentity />
          <h1 className="text-xl font-bold">This page could not be opened</h1>
          <p>Your data has not been changed. Reload to try again.</p>
          {this.state.error && (
            <pre className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded overflow-auto max-h-60 whitespace-pre-wrap font-mono">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
          <button className="px-4 py-3 rounded bg-emerald-800 text-white" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <a className="block underline" href="/dashboard">
            Return to dashboard
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
