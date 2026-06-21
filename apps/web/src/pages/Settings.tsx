import { useState } from 'react';
import { useStore } from '../lib/store';
import { Card } from '../components/Card';
import { LoadingState } from '../components/States';

export function Settings() {
  const config = useStore((s) => s.config);
  const loading = useStore((s) => s.loading);
  const updateConfig = useStore((s) => s.updateConfig);
  const loadDashboard = useStore((s) => s.loadDashboard);

  const [payDay, setPayDay] = useState(config?.pay_day ?? 10);
  const [offsetsText, setOffsetsText] = useState((config?.snapshot_offsets ?? [0, 7, 14, 21]).join(','));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  if (loading || !config) return <LoadingState />;

  const handleSave = async () => {
    setSaving(true);
    try {
      const offsets = offsetsText
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n >= 0 && n <= 30)
        .sort((a, b) => a - b);
      if (offsets.length === 0) {
        alert('采集点至少需要 1 个');
        return;
      }
      await updateConfig({ pay_day: payDay, snapshot_offsets: offsets });
      await loadDashboard();
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const handleExportJSON = () => {
    window.location.href = '/api/export';
  };

  const handleExportCSV = () => {
    window.location.href = '/api/export/snapshots.csv';
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('导入将合并现有数据（不会清空）。确定继续？')) {
      e.target.value = '';
      return;
    }
    setImporting(true);
    setImportMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/import?mode=merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setImportMessage(
        `导入成功：${result.imported.cash_sources} 个现金来源，${result.imported.credit_cards} 张卡，${result.imported.snapshots} 个快照`
      );
      await loadDashboard();
    } catch (e) {
      setImportMessage(`导入失败：${(e as Error).message}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleClearAll = async () => {
    if (!confirm('⚠️ 真的要清空所有数据吗？此操作不可恢复！')) return;
    if (!confirm('再次确认：所有现金来源、信用卡、快照都将被删除。')) return;
    try {
      const res = await fetch('/api/import?mode=overwrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          exported_at: Date.now(),
          config: { pay_day: 10, snapshot_offsets: [0, 7, 14, 21] },
          cash_sources: [],
          credit_cards: [],
          snapshots: [],
        }),
      });
      if (res.ok) {
        await loadDashboard();
        setImportMessage('已清空所有数据');
      }
    } catch (e) {
      setImportMessage(`清空失败：${(e as Error).message}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight-section">设置</h1>
        <p className="text-sm text-notion-text-secondary mt-1">配置发薪日、采集点，管理数据</p>
      </header>

      <Card title="基本配置">
        <div className="space-y-4">
          <div>
            <label className="label">每月发薪日（1-31）</label>
            <input
              type="number"
              className="input font-numeric max-w-[120px]"
              value={payDay}
              onChange={(e) => setPayDay(Number(e.target.value) || 1)}
              min="1"
              max="31"
            />
            <p className="text-xs text-notion-text-muted mt-1">
              距离该日的天数 = 「下一个发薪日」倒计时
            </p>
          </div>
          <div>
            <label className="label">采集点偏移（相对发薪日的天数，逗号分隔）</label>
            <input
              className="input font-numeric"
              value={offsetsText}
              onChange={(e) => setOffsetsText(e.target.value)}
              placeholder="0,7,14,21"
            />
            <p className="text-xs text-notion-text-muted mt-1">
              默认 0,7,14,21 = 发薪日 + 第 7/14/21 天。最多 10 个，范围 0-30。
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </button>
            {savedAt && (
              <span className="text-xs text-notion-success">
                ✓ 已保存（{new Date(savedAt).toLocaleTimeString('zh-CN')}）
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card title="数据导出">
        <p className="text-sm text-notion-text-secondary mb-3">
          所有数据仅存储在你的 Cloudflare D1 中，不上传任何第三方。建议定期导出备份。
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportJSON} className="btn-primary">
            📥 导出 JSON（完整数据）
          </button>
          <button onClick={handleExportCSV} className="btn-secondary">
            📊 导出 CSV（快照表格）
          </button>
        </div>
      </Card>

      <Card title="数据导入">
        <p className="text-sm text-notion-text-secondary mb-3">
          选择之前导出的 JSON 文件，会与现有数据合并（不会清空）。
        </p>
        <label className="btn-secondary cursor-pointer">
          {importing ? '导入中...' : '📤 选择 JSON 文件'}
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
            disabled={importing}
          />
        </label>
        {importMessage && (
          <div className="mt-3 text-sm bg-notion-bg-alt px-3 py-2 rounded-micro">
            {importMessage}
          </div>
        )}
      </Card>

      <Card title="危险操作">
        <p className="text-sm text-notion-text-secondary mb-3">清空所有数据，恢复初始状态</p>
        <button onClick={handleClearAll} className="text-notion-warning hover:underline text-sm">
          清空所有数据
        </button>
      </Card>

      <Card title="关于">
        <dl className="text-sm space-y-2">
          <div className="flex justify-between">
            <dt className="text-notion-text-secondary">版本</dt>
            <dd className="font-numeric">v0.1.0</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-notion-text-secondary">部署</dt>
            <dd>Cloudflare Pages + Workers + D1</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-notion-text-secondary">隐私</dt>
            <dd>所有数据仅存在你的 Cloudflare D1</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}