"use client";

import type { ReactNode } from "react";
import React from "react";

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

class ErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught an error", error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="campus-card border-red-200 bg-red-50 px-5 py-6">
          <div className="flex items-start gap-4">
            <div className="w-1 self-stretch rounded-full bg-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-red-900">页面出现错误</p>
              <p className="mt-2 text-sm text-red-700">
                {this.state.error?.message || "发生了一个未预期的错误。"}
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
