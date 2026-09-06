import { Component } from 'react';

/**
 * Reusable Error Boundary component.
 * Catches JavaScript errors in child components and shows
 * a friendly fallback UI instead of a white screen.
 *
 * Usage:
 *   <ErrorBoundary section="Bank Accounts">
 *     <BankAccountCards />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log error for debugging — remove console.logs before production
    console.error(`[ErrorBoundary] ${this.props.section || 'Unknown'} crashed:`, error.message);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Full page fallback (used at app level)
      if (this.props.fullPage) {
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 max-w-md w-full text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
              <p className="text-gray-500 text-sm mb-6">
                FinSync encountered an unexpected error. Try refreshing the page.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => window.location.reload()}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Refresh page
                </button>
                <button
                  onClick={this.handleRetry}
                  className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Try again
                </button>
              </div>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-6 text-left">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    Error details (development only)
                  </summary>
                  <pre className="mt-2 text-xs bg-gray-50 rounded-lg p-3 overflow-auto text-red-600 max-h-40">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </div>
          </div>
        );
      }

      // Section fallback (used inside pages)
      return (
        <div className="bg-red-50 border border-red-100 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-800 text-sm">
                {this.props.section
                  ? `${this.props.section} failed to load`
                  : 'This section failed to load'
                }
              </p>
              <p className="text-red-600 text-xs mt-1">
                There was an unexpected error. Your data is safe.
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <p className="text-red-500 text-xs mt-1 font-mono">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <button
              onClick={this.handleRetry}
              className="shrink-0 text-xs text-red-600 hover:text-red-800 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
