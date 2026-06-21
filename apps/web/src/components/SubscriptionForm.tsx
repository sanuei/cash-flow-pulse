import { useState, useEffect } from 'react';

type Cycle = 'monthly' | 'yearly';

type FormData = {
  name: string;
  amount: number;
  billing_day: number;
  billing_cycle: Cycle;
  category: string | null;
  note: string | null;
};

const CATEGORIES = ['影音', '工具', '云存储', 'AI', '教育', '其他'];

export function SubscriptionForm({
  initial,
  onSubmit,
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [billingDay, setBillingDay] = useState(initial?.billing_day ?? 15);
  const [billingCycle, setBillingCycle] = useState<Cycle>(initial?.billing_cycle ?? 'monthly');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setAmount(initial.amount);
      setBillingDay(initial.billing_day);
      setBillingCycle(initial.billing_cycle);
      setCategory(initial.category ?? '');
      setNote(initial.note ?? '');
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('名称不能为空');
      return;
    }
    if (billingDay < 1 || billingDay > 31) {
      setError('扣款日必须在 1-31 之间');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        amount,
        billing_day: billingDay,
        billing_cycle: billingCycle,
        category: category || null,
        note: note.trim() || null,
      });
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
          placeholder="如 Netflix / Spotify / iCloud+"
          autoFocus
        />
      </div>
      <div>
        <label className="label">金额（¥）</label>
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
        <label className="label">扣款周期</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-3 py-2 rounded-micro text-sm font-medium transition-colors ${
              billingCycle === 'monthly'
                ? 'bg-notion-blue text-white'
                : 'bg-black/[0.05] text-notion-text-secondary hover:bg-black/[0.08]'
            }`}
          >
            每月
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`px-3 py-2 rounded-micro text-sm font-medium transition-colors ${
              billingCycle === 'yearly'
                ? 'bg-notion-blue text-white'
                : 'bg-black/[0.05] text-notion-text-secondary hover:bg-black/[0.08]'
            }`}
          >
            每年
          </button>
        </div>
      </div>
      <div>
        <label className="label">扣款日（1-31）</label>
        <input
          type="number"
          className="input font-numeric max-w-[120px]"
          value={billingDay}
          onChange={(e) => setBillingDay(Number(e.target.value) || 0)}
          min="1"
          max="31"
          step="1"
        />
      </div>
      <div>
        <label className="label">分类（可选）</label>
        <select
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">不分类</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">备注（可选）</label>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
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