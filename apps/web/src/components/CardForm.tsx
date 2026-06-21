import { useState, useEffect } from 'react';

type FormData = { name: string; statement_amount: number; due_day: number };

export function CardForm({
  initial,
  onSubmit,
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.statement_amount ?? 0);
  const [dueDay, setDueDay] = useState(initial?.due_day ?? 25);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setAmount(initial.statement_amount);
      setDueDay(initial.due_day);
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('名称不能为空');
      return;
    }
    if (dueDay < 1 || dueDay > 31) {
      setError('扣款日必须在 1-31 之间');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), statement_amount: amount, due_day: dueDay });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">卡片名称</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 乐天卡 / 三井住友"
          autoFocus
        />
      </div>
      <div>
        <label className="label">账单金额（¥）</label>
        <input
          type="number"
          className="input font-numeric"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          min="0"
          step="1"
        />
      </div>
      <div>
        <label className="label">每月扣款日（1-31）</label>
        <input
          type="number"
          className="input font-numeric"
          value={dueDay}
          onChange={(e) => setDueDay(Number(e.target.value) || 0)}
          min="1"
          max="31"
          step="1"
        />
        <p className="text-xs text-notion-text-muted mt-1">
          大于当月天数则按月末扣款（如 31 号 → 2 月 28 号）
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