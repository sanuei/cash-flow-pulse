import { useState, useEffect } from 'react';

type Frequency = 'monthly' | 'weekly';

type FormData = {
  name: string;
  amount: number;
  frequency: Frequency;
  pay_day: number | null;
  day_of_week: number | null;
  start_date: string;
  end_date: string | null;
  note: string | null;
};

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function IncomeForm({
  initial,
  onSubmit,
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'monthly');
  const [payDay, setPayDay] = useState(initial?.pay_day ?? 25);
  const [dayOfWeek, setDayOfWeek] = useState(initial?.day_of_week ?? 5);
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
      setPayDay(initial.pay_day ?? 25);
      setDayOfWeek(initial.day_of_week ?? 5);
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
    if (frequency === 'monthly' && (payDay < 1 || payDay > 31)) {
      setError('发薪日必须在 1-31 之间');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        amount,
        frequency,
        pay_day: frequency === 'monthly' ? payDay : null,
        day_of_week: frequency === 'weekly' ? dayOfWeek : null,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">名称</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 工资 / 副业 / 兼职"
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
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFrequency('monthly')}
            className={`px-3 py-2 rounded-micro text-sm font-medium transition-colors ${
              frequency === 'monthly'
                ? 'bg-notion-blue text-white'
                : 'bg-black/[0.05] text-notion-text-secondary hover:bg-black/[0.08]'
            }`}
          >
            每月
          </button>
          <button
            type="button"
            onClick={() => setFrequency('weekly')}
            className={`px-3 py-2 rounded-micro text-sm font-medium transition-colors ${
              frequency === 'weekly'
                ? 'bg-notion-blue text-white'
                : 'bg-black/[0.05] text-notion-text-secondary hover:bg-black/[0.08]'
            }`}
          >
            每周
          </button>
        </div>
      </div>
      {frequency === 'monthly' ? (
        <div>
          <label className="label">每月到账日（1-31）</label>
          <input
            type="number"
            inputMode="numeric"
            className="input font-numeric max-w-[120px]"
            value={payDay}
            onChange={(e) => setPayDay(Number(e.target.value) || 0)}
            min="1"
            max="31"
            step="1"
          />
          <p className="text-xs text-notion-text-muted mt-1">大于当月天数按月末到账</p>
        </div>
      ) : (
        <div>
          <label className="label">每周几到账</label>
          <select
            className="input"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
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
          placeholder="如 25 号发放"
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