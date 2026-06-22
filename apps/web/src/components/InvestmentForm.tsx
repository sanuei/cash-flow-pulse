import { useState, useEffect } from 'react';
import { Icon } from './Icon';

type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

type FormData = {
  name: string;
  amount: number;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  note: string | null;
};

export function InvestmentForm({
  initial,
  onSubmit,
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'daily');
  const [startDate, setStartDate] = useState(
    initial?.start_date ?? new Date().toISOString().split('T')[0]!
  );
  const [endDate, setEndDate] = useState(initial?.end_date ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setAmount(initial.amount);
      setFrequency(initial.frequency);
      setStartDate(initial.start_date);
      setEndDate(initial.end_date ?? '');
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
    if (amount <= 0) {
      setError('金额必须大于 0');
      return;
    }
    if (!startDate) {
      setError('开始日期必填');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        amount,
        frequency,
        start_date: startDate,
        end_date: endDate || null,
        note: note.trim() || null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const freqOptions: { value: Frequency; label: string }[] = [
    { value: 'daily', label: '每天' },
    { value: 'weekly', label: '每周' },
    { value: 'monthly', label: '每月' },
    { value: 'yearly', label: '每年' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">名称</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 基金定投 / 黄金积存"
          autoFocus
        />
      </div>
      <div>
        <label className="label">金额（¥）</label>
        <input
          type="number"
          inputMode="numeric"
          className="input font-numeric"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          min="0"
          step="1"
        />
      </div>
      <div>
        <label className="label">频率</label>
        <div className="grid grid-cols-4 gap-2">
          {freqOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFrequency(opt.value)}
              className={`px-3 py-2 rounded-micro text-sm font-medium transition-colors ${
                frequency === opt.value
                  ? 'bg-notion-blue text-white'
                  : 'bg-black/[0.05] text-notion-text-secondary hover:bg-black/[0.08]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">开始日期</label>
          <input
            type="date"
            className="input font-numeric"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">结束日期（可选）</label>
          <input
            type="date"
            className="input font-numeric"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="label">备注（可选）</label>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="如 每月 15 号执行"
        />
      </div>
      {error && (
        <div className="text-sm text-notion-warning bg-[#fff4eb] px-3 py-2 rounded-micro">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-notion-text-muted">
        <Icon name="calendar" size={12} />
        <span>频率 {freqOptions.find((f) => f.value === frequency)?.label} × 当前周期内会自动计算发生次数</span>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </form>
  );
}