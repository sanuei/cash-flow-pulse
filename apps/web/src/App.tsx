import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { Trends } from './pages/Trends';
import { Settings } from './pages/Settings';
import { useStore } from './lib/store';
import { useEffect } from 'react';

function App() {
  const loadDashboard = useStore((s) => s.loadDashboard);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center">
          <div className="text-5xl mb-4">⚠️</div>
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
      {/* 顶栏（桌面端） */}
      <header className="hidden sm:flex items-center justify-between px-6 h-14 border-b border-notion-border bg-white">
        <div className="flex items-center gap-2 font-bold text-notion-text">
          <span className="text-lg">💰</span>
          <span>Cash Flow Pulse</span>
        </div>
        <nav className="flex items-center gap-1">
          <NavTab to="/">主页</NavTab>
          <NavTab to="/trends">曲线</NavTab>
          <NavTab to="/settings">设置</NavTab>
        </nav>
      </header>

      {/* 内容 */}
      <main className={`flex-1 ${loading ? 'opacity-60' : ''} transition-opacity`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* 底部 Tab（移动端） */}
      <nav className="sm:hidden flex items-center justify-around border-t border-notion-border bg-white sticky bottom-0 h-14">
        <NavTabMobile to="/" icon="🏠" label="主页" />
        <NavTabMobile to="/trends" icon="📈" label="曲线" />
        <NavTabMobile to="/settings" icon="⚙️" label="设置" />
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

function NavTabMobile({ to, icon, label }: { to: string; icon: string; label: string }) {
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
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export default App;