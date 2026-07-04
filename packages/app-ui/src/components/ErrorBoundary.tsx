import { Component } from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-4 bg-[#1a1d1a] px-8 text-center">
          <div className="text-lg font-semibold text-red-400">启动失败</div>
          <div className="max-w-md break-all text-sm text-zinc-500">{this.state.error.message}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-green-600 px-5 py-2 text-sm text-white transition-colors hover:bg-green-500"
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
