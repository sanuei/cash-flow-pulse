/**
 * 登录页（v1.0+）
 *
 * 极简设计：一个 Google 登录按钮 + 「为什么用 Google」说明
 */

import { useStore } from '../lib/store';
import { Icon } from '../components/Icon';

export function Login() {
  const startGoogleLogin = useStore((s) => s.startGoogleLogin);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-notion-bg">
      <div className="card p-10 max-w-md w-full text-center">
        {/* Logo */}
        <div className="inline-flex items-center justify-center w-14 h-14 mb-6 rounded-[var(--radius-lg)] bg-[var(--c-accent-soft)]">
          <Icon name="wallet" size={28} className="text-[var(--c-accent-text)]" strokeWidth={1.5} />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold mb-2 text-notion-text font-display">现金流</h1>
        <p className="text-notion-text-secondary text-sm mb-8">
          个人现金流可视化 · 日均可用预算
        </p>

        {/* Google Login Button */}
        <button
          onClick={startGoogleLogin}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-notion border border-notion-border bg-white hover:bg-notion-bg-alt transition-colors text-[15px] font-medium text-notion-text"
        >
          {/* Google G logo (inline SVG, no emoji) */}
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          使用 Google 账号登录
        </button>

        {/* Why Google */}
        <div className="mt-8 pt-6 border-t border-notion-border text-left">
          <p className="text-xs font-semibold text-notion-text-secondary uppercase tracking-wider mb-3">
            为什么用 Google
          </p>
          <ul className="space-y-2 text-[13px] text-notion-text-secondary">
            <li className="flex items-start gap-2">
              <Icon name="check" size={14} className="text-notion-green mt-0.5 flex-shrink-0" strokeWidth={2} />
              <span>一键登录，不用记密码</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="check" size={14} className="text-notion-green mt-0.5 flex-shrink-0" strokeWidth={2} />
              <span>我们不存你的密码，Google 也不看你的财务数据</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="check" size={14} className="text-notion-green mt-0.5 flex-shrink-0" strokeWidth={2} />
              <span>数据仅存在你的 Cloudflare 账户，加密传输</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <p className="mt-8 text-[11px] text-notion-text-secondary">
          登录即表示同意
          <a href="/terms" className="text-notion-blue hover:underline mx-1">服务条款</a>
          和
          <a href="/privacy" className="text-notion-blue hover:underline mx-1">隐私政策</a>
        </p>
      </div>
    </div>
  );
}