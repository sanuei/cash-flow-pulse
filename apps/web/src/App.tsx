import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
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

// Trends 依赖 recharts（gzip ~105KB），懒加载以减小首屏 bundle
const Trends = lazy(() => import('./pages/Trends').then((m) => ({ default: m.Trends })));

function App() {
  const authStatus = useStore((s) => s.authStatus);
  const currentUser = useStore((s) => s.currentUser);
  const checkSession = useStore((s) => s.checkSession);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);

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
        <Icon name="loading" size={32} className="text-notion-text-secondary animate-spin" strokeWidth={1.5} />
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
        <div className="card p-8 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 mb-4 rounded-full bg-[#fff4eb]">
            <Icon name="warning" size={28} className="text-notion-warning" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold mb-2">加载失败</h2>
          <p className="text-notion-text-secondary text-sm mb-4">{error}</p>
          <button className="btn-primary" onClick={() => loadDashboard()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-notion-bg">
      {/* 顶栏（桌面端：6 项文字 Tab） */}
      <header className="hidden sm:flex items-center justify-between px-6 h-14 border-b border-notion-border bg-white">
        <div className="flex items-center gap-2 font-bold text-notion-text">
          <Icon name="wallet" size={20} className="text-notion-text" />
          <span>Cash Flow Pulse</span>
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

      {/* 顶栏（移动端：Logo + 曲线/设置图标） */}
      <header className="sm:hidden flex items-center justify-between px-4 h-12 border-b border-notion-border bg-white">
        <div className="flex items-center gap-2 font-bold text-notion-text text-sm">
          <Icon name="wallet" size={16} className="text-notion-text" />
          <span>Cash Flow Pulse</span>
        </div>
        <div className="flex items-center gap-1">
          <NavLink
            to="/trends"
            className={({ isActive }) =>
              `p-2 rounded-micro transition-colors ${isActive ? 'text-notion-blue' : 'text-notion-text-secondary hover:text-notion-text'}`
            }
            aria-label="曲线"
          >
            <Icon name="chart" size={20} strokeWidth={1.75} />
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `p-2 rounded-micro transition-colors ${isActive ? 'text-notion-blue' : 'text-notion-text-secondary hover:text-notion-text'}`
            }
            aria-label="设置"
          >
            <Icon name="settings" size={20} strokeWidth={1.75} />
          </NavLink>
        </div>
      </header>

      {/* 内容 */}
      <main className={`flex-1 ${loading ? 'opacity-60' : ''} transition-opacity`}>
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

      {/* 底部 Tab（移动端：4 个主要页面） */}
      {/* paddingBottom + 高度自动加上 iOS home indicator 的安全区高度（iPhone X 以上约 34px） */}
      <nav
        className="sm:hidden flex items-center justify-around border-t border-notion-border bg-white sticky bottom-0"
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
    </div>
  );
}

function NavTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-micro text-[15px] font-semibold transition-colors ${
          isActive ? 'bg-black/[0.05] text-notion-text' : 'text-notion-text-secondary hover:text-notion-text'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function NavTabMobile({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] transition-colors ${
          isActive ? 'text-notion-blue' : 'text-notion-text-secondary'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon name={icon} size={22} strokeWidth={isActive ? 2 : 1.75} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default App;