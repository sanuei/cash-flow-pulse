/**
 * Sidebar — 桌面端导航侧栏（v1.4 升级）
 *
 * 240px 固定宽 + sticky 定位 + 玻璃背景
 * 内容: Logo / 6 项 nav / 分隔线 / user info / 退出
 * 移动端 (< sm) 不显示,使用底部 nav
 */

import { NavLink } from 'react-router-dom';
import { Logo } from './Logo';
import { Icon, type IconName } from './Icon';
import { useStore } from '../lib/store';
import type { CurrentUser } from '../lib/store';

type NavItem = { to: string; label: string; icon: IconName };

const NAV_ITEMS: NavItem[] = [
  { to: '/',            label: '总览', icon: 'home' },
  { to: '/incomes',     label: '收入', icon: 'income' },
  { to: '/assets',      label: '资产', icon: 'cash' },
  { to: '/investments', label: '投资', icon: 'investment' },
  { to: '/expenses',    label: '消费', icon: 'bill' },
  { to: '/diagnosis',   label: '诊断', icon: 'gauge' },
  { to: '/trends',      label: '曲线', icon: 'chart' },
  { to: '/settings',    label: '设置', icon: 'settings' },
];

export function Sidebar() {
  const currentUser = useStore((s) => s.currentUser);
  const logout = useStore((s) => s.logout);

  return (
    <aside
      className="hidden sm:flex flex-col w-60 h-full border-r border-[var(--c-border)] glass flex-shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Logo 区 */}
      <div className="px-5 py-5 border-b border-[var(--c-border)]">
        <Logo size={18} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-[13.5px] font-medium transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)] ${
                isActive
                  ? 'bg-[var(--c-accent-soft)] text-[var(--c-accent-text)]'
                  : 'text-notion-text-secondary hover:bg-[var(--c-bg-alt)] hover:text-notion-text'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  name={item.icon}
                  size={17}
                  strokeWidth={isActive ? 2 : 1.75}
                  className="flex-shrink-0"
                />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 分隔线 + User info */}
      <div className="px-3 py-3 border-t border-[var(--c-border)] space-y-2">
        {currentUser && <UserInfo user={currentUser} />}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-[12.5px] text-notion-text-secondary hover:bg-[var(--c-bg-alt)] hover:text-notion-text transition-colors"
        >
          <Icon name="logout" size={15} strokeWidth={1.75} className="flex-shrink-0" />
          <span>退出登录</span>
        </button>
      </div>
    </aside>
  );
}

function UserInfo({ user }: { user: CurrentUser }) {
  const displayName = user.name || user.email.split('@')[0] || '用户';
  const initial = displayName[0]?.toUpperCase() || '?';

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      {user.picture ? (
        <img
          src={user.picture}
          alt={displayName}
          className="w-7 h-7 rounded-full flex-shrink-0"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-7 h-7 rounded-full flex-shrink-0 inline-flex items-center justify-center bg-[var(--c-accent-soft)] text-[var(--c-accent-text)] text-[12px] font-semibold">
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-notion-text truncate">
          {displayName}
        </div>
        <div className="text-[10.5px] text-notion-text-muted truncate">
          {user.email}
        </div>
      </div>
    </div>
  );
}
