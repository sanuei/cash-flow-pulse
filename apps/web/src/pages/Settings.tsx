import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { Card } from '../components/Card';
import { LoadingState } from '../components/States';
import { Icon } from '../components/Icon';
import { apiGet } from '../lib/api';

type SessionInfo = {
  id: string;
  is_current: boolean;
  created_at: number;
  expires_at: number;
  ip: string | null;
  user_agent: string | null;
};

const APP_VERSION = 'v1.1.0';

export function Settings() {
  const config = useStore((s) => s.config);
  const loading = useStore((s) => s.loading);
  const updateConfig = useStore((s) => s.updateConfig);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const currentUser = useStore((s) => s.currentUser);
  const logout = useStore((s) => s.logout);

  const [payDay, setPayDay] = useState(config?.pay_day ?? 10);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [importing, setImporting] = useState(false);
  const [dataMsg, setDataMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [clearConfirm, setClearConfirm] = useState(false);

  // ── 登录设备 ──
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    setSessionsLoading(true);
    apiGet<SessionInfo[]>('/auth/sessions')
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, []);

  const revokeSession = async (id: string) => {
    setRevokingId(id);
    try {
      await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE', credentials: 'include' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setRevokingId(null);
    }
  };

  if (loading || !config) return <LoadingState />;

  // ── 保存发薪日 ──
  const handleSave = async () => {
    // 改发薪日会重算所有历史周期的划分，提示用户
    if (payDay !== config.pay_day) {
      if (!confirm('修改发薪日会重新划分所有历史周期，影响趋势曲线的周期归属。确定修改？')) {
        return;
      }
    }
    setSaving(true);
    try {
      await updateConfig({ pay_day: payDay });
      await loadDashboard();
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  // ── 导出 ──
  const handleExportJSON = async () => {
    try {
      const data = await apiGet<object>('/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cash-flow-pulse-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDataMsg({ type: 'err', text: '导出失败，请重试' });
    }
  };

  const handleExportCSV = () => {
    window.location.href = '/api/export/snapshots.csv';
  };

  // ── 导入 ──
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('导入将与现有数据合并（不会清空）。确定继续？')) {
      e.target.value = '';
      return;
    }
    setImporting(true);
    setDataMsg(null);
    try {
      const text = await file.text();
      JSON.parse(text); // 提前验证 JSON 格式
      const res = await fetch('/api/import?mode=merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: text,
      });
      if (!res.ok) throw new Error(await res.text());
      const result: any = await res.json();
      setDataMsg({
        type: 'ok',
        text: `导入成功：${result.imported?.cash_sources ?? 0} 个现金来源，${result.imported?.credit_cards ?? 0} 张卡，${result.imported?.snapshots ?? 0} 个快照`,
      });
      await loadDashboard();
    } catch (err) {
      setDataMsg({ type: 'err', text: `导入失败：${(err as Error).message}` });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  // ── 清空数据 ──
  const handleClearAll = async () => {
    if (!clearConfirm) { setClearConfirm(true); return; }
    setClearConfirm(false);
    try {
      const res = await fetch('/api/import?mode=overwrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          version: 1,
          exported_at: Date.now(),
          config: { pay_day: 10, snapshot_offsets: [0, 7, 14, 21] },
          cash_sources: [], credit_cards: [], snapshots: [],
        }),
      });
      if (res.ok) {
        await loadDashboard();
        setDataMsg({ type: 'ok', text: '已清空所有数据' });
      }
    } catch (err) {
      setDataMsg({ type: 'err', text: `操作失败：${(err as Error).message}` });
    }
  };

  const handleLogout = async () => {
    if (!confirm('确定要退出登录吗？')) return;
    await logout();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight-section flex items-center gap-2">
          <Icon name="settings" size={28} strokeWidth={1.5} className="text-notion-text-secondary" />
          <span>设置</span>
        </h1>
      </header>

      {/* ── 1. 账号 ── */}
      {currentUser && (
        <Card title="账号">
          <div className="flex items-center gap-4">
            {currentUser.picture ? (
              <img
                src={currentUser.picture}
                alt={currentUser.name ?? currentUser.email}
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-notion-bg-alt flex items-center justify-center">
                <Icon name="user" size={24} className="text-notion-text-secondary" strokeWidth={1.5} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-notion-text truncate">
                {currentUser.name ?? currentUser.email}
              </div>
              <div className="text-sm text-notion-text-secondary truncate">{currentUser.email}</div>
            </div>
            {/* tier 徽章暂隐：付费功能（Stripe）尚未接入，避免误导。接入后恢复 */}
          </div>
          <div className="mt-4 pt-4 border-t border-notion-border flex items-center justify-between">
            <p className="text-xs text-notion-text-muted">通过 Google 账号登录</p>
            <button
              onClick={handleLogout}
              className="btn-secondary inline-flex items-center gap-1.5 text-sm"
            >
              <Icon name="logout" size={15} strokeWidth={2} />
              <span>退出登录</span>
            </button>
          </div>
        </Card>
      )}

      {/* ── 2. 登录设备 ── */}
      <Card title="登录设备">
        <p className="text-sm text-notion-text-secondary mb-4">
          当前活跃的登录会话，可远程退出不认识的设备。
        </p>
        {sessionsLoading ? (
          <div className="text-sm text-notion-text-muted">加载中...</div>
        ) : sessions.length === 0 ? (
          <div className="text-sm text-notion-text-muted">无活跃会话</div>
        ) : (
          <ul className="divide-y divide-notion-border -mx-5">
            {sessions.map((s) => {
              const ua = s.user_agent ?? '';
              const device = ua.includes('iPhone') || ua.includes('iPad') ? '📱 iOS'
                : ua.includes('Android') ? '📱 Android'
                : ua.includes('Mac') ? '💻 Mac'
                : ua.includes('Windows') ? '🖥 Windows'
                : '🌐 浏览器';
              const createdDate = new Date(s.created_at).toLocaleDateString('zh-CN', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              });
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-notion-text flex items-center gap-2">
                      {device}
                      {s.is_current && <span className="badge text-[10px] px-1.5 py-0.5">当前设备</span>}
                    </div>
                    <div className="text-xs text-notion-text-muted mt-0.5">
                      {s.ip ?? '未知 IP'} · 登录于 {createdDate}
                    </div>
                  </div>
                  {!s.is_current && (
                    <button
                      onClick={() => revokeSession(s.id)}
                      disabled={revokingId === s.id}
                      className="text-xs text-notion-warning hover:underline flex-shrink-0"
                    >
                      {revokingId === s.id ? '退出中...' : '退出'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── 3. 发薪日 ── */}
      <Card title="发薪日">
        <p className="text-sm text-notion-text-secondary mb-4">
          设置你每月的发薪日，所有周期计算和日均预算都以此为基准。
        </p>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-notion-text-secondary">每月</span>
          <input
            type="number"
            inputMode="numeric"
            className="input font-numeric w-20 text-center"
            value={payDay}
            onChange={(e) => setPayDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
            min="1"
            max="31"
          />
          <span className="text-sm text-notion-text-secondary">号</span>
        </div>
        <div className="flex items-center gap-3 pt-4 border-t border-notion-border">
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
          {savedAt && (
            <span className="text-xs text-notion-success inline-flex items-center gap-1">
              <Icon name="check" size={14} strokeWidth={2.5} />
              <span>已保存 {new Date(savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
            </span>
          )}
        </div>
      </Card>


      {/* ── 4. 数据管理 ── */}
      <Card title="数据管理">
        <p className="text-sm text-notion-text-secondary mb-5">
          所有数据存储在你的 Cloudflare D1，不上传第三方。建议定期导出备份。
        </p>

        {/* 导出 */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-notion-text-muted uppercase tracking-wider mb-2">
            导出
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExportJSON}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Icon name="download" size={15} strokeWidth={2} />
              <span>导出 JSON（完整备份）</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Icon name="export-csv" size={15} />
              <span>导出 CSV（快照数据）</span>
            </button>
          </div>
        </div>

        {/* 导入 */}
        <div className="mb-5 pb-5 border-b border-notion-border">
          <div className="text-xs font-semibold text-notion-text-muted uppercase tracking-wider mb-2">
            导入
          </div>
          <label className="btn-secondary cursor-pointer inline-flex items-center gap-1.5 text-sm">
            <Icon name="import" size={15} />
            <span>{importing ? '导入中...' : '从 JSON 文件导入'}</span>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImport}
              disabled={importing}
            />
          </label>
          <p className="text-xs text-notion-text-muted mt-1.5">
            与现有数据合并，不会删除已有记录
          </p>
        </div>

        {/* 消息反馈 */}
        {dataMsg && (
          <div className={`mb-4 text-sm px-3 py-2 rounded-micro flex items-start gap-2 ${
            dataMsg.type === 'ok'
              ? 'bg-notion-success/8 text-notion-success'
              : 'bg-notion-warning/8 text-notion-warning'
          }`}>
            <Icon name={dataMsg.type === 'ok' ? 'check' : 'warning'} size={14} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
            <span>{dataMsg.text}</span>
          </div>
        )}

        {/* 清空数据（降级为小操作区） */}
        <div>
          <div className="text-xs font-semibold text-notion-text-muted uppercase tracking-wider mb-2">
            重置
          </div>
          {!clearConfirm ? (
            <button
              onClick={handleClearAll}
              className="text-sm text-notion-text-muted hover:text-notion-warning transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="close" size={14} strokeWidth={2} />
              <span>清空所有数据…</span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-notion-warning">确认清空？此操作不可恢复</span>
              <button
                onClick={handleClearAll}
                className="text-sm font-semibold text-notion-warning hover:underline"
              >
                确认清空
              </button>
              <button
                onClick={() => setClearConfirm(false)}
                className="text-sm text-notion-text-muted hover:text-notion-text"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* ── 页脚版本信息 ── */}
      <div className="text-center text-xs text-notion-text-muted pb-4 space-y-1">
        <div>Cash Flow Pulse {APP_VERSION} · Cloudflare Pages + Workers + D1</div>
        <div>数据仅存储在你的 Cloudflare 账户，完全私有</div>
      </div>
    </div>
  );
}
