/**
 * 管理员后台（v1.4 新增）
 *
 * 权限: 只有 is_admin=true 的用户能访问 (路由层 + 组件层双重校验)
 * 入口: Settings 页面底部"管理后台"按钮(仅 admin 可见) 或 /admin
 *
 * 功能:
 *   - 平台总览(用户数 / 活跃 / 现金总额)
 *   - 用户列表(每个用户的数据规模)
 *   - 单个用户详情(点击查看)
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { PageTitle } from '../components/PageTitle';
import { Icon } from '../components/Icon';
import { LoadingState, EmptyState } from '../components/States';
import { Card } from '../components/Card';
import { formatYen } from '@cfp/shared';
import { apiGet } from '../lib/api';

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  tier: 'free' | 'pro';
  is_admin: number;
  created_at: number;
  last_login_at: number | null;
  cash_count: number;
  cash_total: number;
  card_count: number;
  income_count: number;
  bill_count: number;
  sub_count: number;
  inv_count: number;
  snap_count: number;
};

type AdminStats = {
  users: { n: number };
  active_sessions: { n: number };
  cash: { n: number; total: number };
  cards: { n: number };
  incomes: { n: number };
  snapshots: { n: number };
};

export function Admin() {
  const currentUser = useStore((s) => s.currentUser);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.is_admin) {
      setError('需要管理员权限');
      return;
    }
    let cancelled = false;
    Promise.all([
      apiGet<{ users: AdminUser[] }>('/admin/users'),
      apiGet<AdminStats>('/admin/stats'),
    ])
      .then(([u, s]) => {
        if (cancelled) return;
        setUsers(u.users);
        setStats(s);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => { cancelled = true; };
  }, [currentUser]);

  // 权限校验
  if (!currentUser?.is_admin) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <EmptyState
          icon="lock"
          title="无权访问"
          description={error ?? '此页面仅限管理员访问'}
          action={
            <Link to="/" className="btn-primary inline-block">返回总览</Link>
          }
        />
      </div>
    );
  }

  if (error || !users || !stats) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <PageTitle icon="lock" title="管理后台" subtitle="用户与数据总览" />
        {error ? (
          <EmptyState icon="warning" title="加载失败" description={error} />
        ) : (
          <LoadingState />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <PageTitle icon="lock" title="管理后台" subtitle={`已登录为 ${currentUser.email} (admin)`} />

      {/* 平台总览 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox label="总用户" value={String(stats.users.n)} accent />
        <StatBox label="活跃会话" value={String(stats.active_sessions.n)} />
        <StatBox label="现金账户" value={String(stats.cash.n)} sub={`总计 ${formatYen(stats.cash.total ?? 0)}`} />
        <StatBox label="快照" value={String(stats.snapshots.n)} />
      </div>

      {/* 用户列表 */}
      <Card title={`用户列表 (${users.length})`}>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-[13px]">
            <thead className="text-notion-text-muted text-[11px] uppercase tracking-caps">
              <tr className="border-b border-[var(--c-border)]">
                <th className="text-left px-3 py-2 font-semibold">用户</th>
                <th className="text-left px-3 py-2 font-semibold">权限</th>
                <th className="text-right px-3 py-2 font-semibold">现金</th>
                <th className="text-right px-3 py-2 font-semibold">信用卡</th>
                <th className="text-right px-3 py-2 font-semibold">账单</th>
                <th className="text-right px-3 py-2 font-semibold">订阅</th>
                <th className="text-right px-3 py-2 font-semibold">投资</th>
                <th className="text-right px-3 py-2 font-semibold">收入</th>
                <th className="text-right px-3 py-2 font-semibold">快照</th>
                <th className="text-right px-3 py-2 font-semibold">注册</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-[var(--c-border)] hover:bg-[var(--c-bg-alt)] transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {u.picture ? (
                        <img src={u.picture} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[var(--c-accent-soft)] inline-flex items-center justify-center text-[10px] font-semibold text-[var(--c-accent-text)]">
                          {(u.name || u.email)[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-notion-text truncate">
                          {u.name || <span className="text-notion-text-muted">未设</span>}
                        </div>
                        <div className="text-[11px] text-notion-text-muted truncate max-w-[180px]">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {u.is_admin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--c-accent-soft)] text-[var(--c-accent-text)] text-[11px] font-semibold">
                        <Icon name="lock" size={10} strokeWidth={2} />
                        admin
                      </span>
                    ) : (
                      <span className="text-[11px] text-notion-text-muted">
                        {u.tier === 'pro' ? 'pro' : 'free'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="font-numeric font-semibold tabular-nums">{u.cash_count}</div>
                    <div className="text-[10px] text-notion-text-muted font-numeric tabular-nums">
                      {formatYen(u.cash_total)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-numeric tabular-nums">{u.card_count}</td>
                  <td className="px-3 py-2.5 text-right font-numeric tabular-nums">{u.bill_count}</td>
                  <td className="px-3 py-2.5 text-right font-numeric tabular-nums">{u.sub_count}</td>
                  <td className="px-3 py-2.5 text-right font-numeric tabular-nums">{u.inv_count}</td>
                  <td className="px-3 py-2.5 text-right font-numeric tabular-nums">{u.income_count}</td>
                  <td className="px-3 py-2.5 text-right font-numeric tabular-nums">{u.snap_count}</td>
                  <td className="px-3 py-2.5 text-right text-notion-text-muted text-[11px] font-numeric tabular-nums">
                    {new Date(u.created_at).toLocaleDateString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? 'border-[var(--c-accent)]' : ''}`}>
      <div className="text-[11px] text-notion-text-muted uppercase tracking-caps font-semibold">{label}</div>
      <div className="text-2xl font-bold font-numeric tabular-nums mt-1.5 text-notion-text">{value}</div>
      {sub && <div className="text-[11px] text-notion-text-muted mt-0.5 font-numeric tabular-nums">{sub}</div>}
    </div>
  );
}
