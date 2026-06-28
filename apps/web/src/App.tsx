import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { Overview } from './pages/Overview';
import { IncomesPage } from './pages/IncomesPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { useStore } from './lib/store';
import { useEffect, lazy, Suspense } from 'react';
import { Icon, type IconName } from './components/Icon';
import { LoadingState } from './components/States';
import { Toaster } from './components/Toaster';
import { useReducedMotion } from './lib/motion';
import { getStoredTheme, applyTheme } from './lib/theme';

// Trends 依赖 recharts（gzip ~105KB），懒加载以减小首屏 bundle
const Trends = lazy(() => import('./pages/Trends').then((m) => ({ default: m.Trends })));

function App() {
  const authStatus = useStore((s) => s.authStatus);
  const checkSession = useStore((s) => s.checkSession);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const reduced = useReducedMotion();

  // 主题初始化（SSR-safe 兜底，inline script 已先行执行）
  useEffect(() => { applyTheme(getStoredTheme()); }, []);

  // 1. 启动时 check session（一次）
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // 2. auth 状态确定后，加载 dashboard（已登录）或跳 Login
  useEffect(() => {
    if (authStatus === 'authenticated') {
      loadDashboard();
    }
  }, [authStatus, loadDashboard]);

  // 加载中：显示 spinner
  if (authStatus === 'unknown') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="loading" size={28} className="text-notion-text-secondary animate-spin" strokeWidth={1.5} />
      </div>
    );
  }

  // 未登录：渲染 Login
  if (authStatus === 'unauthenticated') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // 已登录：渲染主应用
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center anim-slide-up">
          <div className="inline-flex items-center justify-center w-14 h-14 mb-4 rounded-full bg-[var(--c-warning-soft)]">
            <Icon name="warning" size={28} className="text-notion-warning" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold mb-2 tracking-tight-section">加载失败</h2>
          <p className="text-notion-text-secondary text-[14px] mb-4 leading-relaxed">{error}</p>
          <button className="btn-primary" onClick={() => loadDashboard()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    // 100dvh 钉死外层 + overflow-hidden: iOS 橡皮筋只发生在最外层,内层 main 独立滚动就不会露出 body 背景
    // bg 放在 main 上: 容器透明,body 背景的 radial-gradient 色晕可以透出,让整体视觉更通透
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* 顶栏（桌面端：6 项文字 Tab） — 玻璃模糊背景 */}
      <header className="hidden sm:flex items-center justify-between px-6 h-14 border-b border-notion-border glass fixed top-0 inset-x-0 z-30">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--c-accent-soft)]">
            <Icon name="wallet" size={15} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
          </span>
          <span style={{ fontFamily: 'var(--font-logo)', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.02em', color: 'var(--c-text)' }}>
            cash<span style={{ color: 'var(--c-accent)' }}>flow</span>
          </span>
        </div>
        <nav className="flex items-center gap-1">
          <NavTab to="/">总览</NavTab>
          <NavTab to="/incomes">收入</NavTab>
          <NavTab to="/investments">投资</NavTab>
          <NavTab to="/expenses">消费</NavTab>
          <NavTab to="/trends">曲线</NavTab>
          <NavTab to="/settings">设置</NavTab>
        </nav>
      </header>

      {/* 顶栏（移动端：Logo + 曲线/设置图标） — 玻璃模糊 + safe-area 适配
          尺寸:v1.4 加大,Logo 28px / 文字 17px / 头部 56px,与桌面端 h-14 对齐 */}
      <header
        className="sm:hidden flex items-center justify-between px-4 border-b border-notion-border glass fixed top-0 inset-x-0 z-30"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top))',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--c-accent-soft)]">
            <Icon name="wallet" size={15} className="text-[var(--c-accent-text)]" strokeWidth={1.75} />
          </span>
          <span style={{ fontFamily: 'var(--font-logo)', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.02em', color: 'var(--c-text)' }}>
            cash<span style={{ color: 'var(--c-accent)' }}>flow</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <NavLink
            to="/trends"
            className={({ isActive }) =>
              `p-2 rounded-[var(--radius-sm)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
                isActive ? 'text-[var(--c-accent-text)] bg-[var(--c-accent-soft)]' : 'text-notion-text-secondary hover:text-notion-text'
              }`
            }
            aria-label="曲线"
          >
            <Icon name="chart" size={22} strokeWidth={1.75} />
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `p-2 rounded-[var(--radius-sm)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
                isActive ? 'text-[var(--c-accent-text)] bg-[var(--c-accent-soft)]' : 'text-notion-text-secondary hover:text-notion-text'
              }`
            }
            aria-label="设置"
          >
            <Icon name="settings" size={22} strokeWidth={1.75} />
          </NavLink>
        </div>
      </header>

      {/* 内容 — 路由切换时 fade-in;pt/pb 给 fixed 头尾留位;overflow-y-auto 让 main 自己滚
          mobile 端 pt/pb 用 calc 包含 safe-area,跟 header/nav 实际高度对齐 */}
      <main
        key={useLocation().pathname}
        className={`
          flex-1 overflow-y-auto overscroll-contain
          bg-notion-bg
          pt-[calc(3.5rem+env(safe-area-inset-top))] sm:pt-14
          pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0
          ${loading ? 'opacity-60' : ''}
          transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
          ${reduced ? '' : 'anim-fade-up'}
        `}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/incomes" element={<IncomesPage />} />
          <Route path="/investments" element={<InvestmentsPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/trends" element={<Suspense fallback={<LoadingState />}><Trends /></Suspense>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* 底部 Tab（移动端：4 个主要页面） — 玻璃模糊 + 顶边阴影 */}
      <nav
        className="sm:hidden flex items-center justify-around glass border-t border-[var(--c-border)] fixed bottom-0 inset-x-0 z-30 shadow-[var(--shadow-md)]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          height: 'calc(3.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <NavTabMobile to="/" icon="home" label="总览" />
        <NavTabMobile to="/incomes" icon="income" label="收入" />
        <NavTabMobile to="/investments" icon="investment" label="投资" />
        <NavTabMobile to="/expenses" icon="bill" label="消费" />
      </nav>

      {/* 全局 Toast（删除撤销等） */}
      <Toaster />
    </div>
  );
}

/**
 * 桌面端导航 Tab（v2 升级）
 * 升级点：
 *   1) 选中态加底部 2px 墨色 indicator，从左/右滑入（基于 layout-id 思路的纯 CSS 实现）
 *   2) hover 时文字颜色和 indicator 渐变
 *   3) 焦点环使用 design-system 颜色
 */
function NavTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink to={to} end className="relative">
      {({ isActive }) => (
        <span
          className={`
            nav-tab block
            ${isActive ? 'nav-tab-active' : ''}
          `}
        >
          {children}
          {/* 底部 indicator — 选中时显示，hover 时半透明显示 */}
          <span
            aria-hidden="true"
            className={`
              absolute left-3 right-3 -bottom-[15px] h-[2px] rounded-t
              bg-[var(--c-accent)] origin-center
              transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
              ${isActive ? 'scale-x-100' : 'scale-x-0'}
            `}
          />
        </span>
      )}
    </NavLink>
  );
}

/**
 * 移动端 Tab（v2 升级）
 * 升级点：icon 选中时不仅 stroke 变粗，还加 scale 1.05（与 active 状态协同）
 */
function NavTabMobile({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <NavLink to={to} end>
      {({ isActive }) => (
        <span
          className={`
            nav-tab-mobile
            ${isActive ? 'nav-tab-mobile-active' : ''}
          `}
        >
          <span className="nav-pill-icon">
            <Icon
              name={icon}
              size={21}
              strokeWidth={isActive ? 2 : 1.75}
              className={`transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
                isActive ? 'scale-105' : 'scale-100'
              }`}
            />
          </span>
          <span className="font-medium">{label}</span>
        </span>
      )}
    </NavLink>
  );
}

export default App;
