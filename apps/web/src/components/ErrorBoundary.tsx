import { Component, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * 根级错误边界：任一子组件渲染抛错时兜底，避免整页白屏。
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: unknown) {
    // 控制台留痕，便于排查（未来可接入 Sentry）
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-notion-bg">
        <div className="card p-8 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 mb-4 rounded-full bg-[#fff4eb]">
            <Icon name="warning" size={28} className="text-notion-warning" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold mb-2">出了点问题</h2>
          <p className="text-notion-text-secondary text-sm mb-1">页面遇到错误，已停止渲染以保护数据。</p>
          {this.state.message && (
            <p className="text-notion-text-muted text-xs mb-4 font-mono break-all">
              {this.state.message}
            </p>
          )}
          <button className="btn-primary mt-2" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      </div>
    );
  }
}
