import { useState, useEffect } from 'react';
import type { CashSource } from '@cfp/shared';

type FormData = { name: string; balance: number; locked_amount: number };

export function CashForm({
  initial,
  onSubmit,
}: {
  initial?: CashSource;
  onSubmit: (data: FormData) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [balance, setBalance] = useState(initial?.balance ?? 0);
  const [lockedAmount, setLockedAmount] = useState(initial?.locked_amount ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当 initial 改变时（编辑模式）重置表单
  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setBalance(initial.balance);
      setLockedAmount(initial.locked_amount);
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('名称不能为空');
      return;
    }
    if (lockedAmount > balance) {
      setError('锁定金额不能超过余额');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), balance, locked_amount: lockedAmount });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">名称</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 PayPay / 钱包现金"
          autoFocus
        />
      </div>
      <div>
        <label className="label">余额（¥）</label>
        <input
          type="number"
          className="input font-numeric"
          value={balance}
          onChange={(e) => setBalance(Number(e.target.value) || 0)}
          min="0"
          step="1"
        />
      </div>
      <div>
        <label className="label">锁定金额（¥）</label>
        <input
          type="number"
          className="input font-numeric"
          value={lockedAmount}
          onChange={(e) => setLockedAmount(Number(e.target.value) || 0)}
          min="0"
          max={balance}
          step="1"
        />
        <p className="text-xs text-notion-text-muted mt-1">
          如 PayPay 中用于还信用卡的「过路钱」，从可支配余额中扣除
        </p>
      </div>
      {error && (
        <div className="text-sm text-notion-warning bg-[#fff4eb] px-3 py-2 rounded-micro">
          {error}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </form>
  );
}