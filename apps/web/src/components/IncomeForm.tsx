import { useState, useEffect } from 'react';
import { HeroAmount, Field, Segmented, Collapsible, FormError, FormActions } from './FormKit';

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
  onCancel,
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel?: () => void;
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
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (frequency === 'monthly' && (payDay < 1 || payDay > 31)) {
      setError('到账日必须在 1-31 之间'); return;
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
      <HeroAmount label="收入金额" value={amount} onChange={setAmount} tone="success" />

      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 工资 / 副业 / 兼职"
        />
      </Field>

      <Field label="频率">
        <Segmented
          options={[{ value: 'monthly', label: '每月' }, { value: 'weekly', label: '每周' }]}
          value={frequency}
          onChange={setFrequency}
        />
      </Field>

      {frequency === 'monthly' ? (
        <Field label="每月到账日" hint="大于当月天数按月末到账">
          <div className="relative max-w-[140px]">
            <input
              type="number" inputMode="numeric" className="input font-numeric pr-9"
              value={payDay} onChange={(e) => setPayDay(Number(e.target.value) || 0)}
              min="1" max="31" step="1"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-notion-text-muted">号</span>
          </div>
        </Field>
      ) : (
        <Field label="每周几到账">
          <select className="input" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
            {WEEKDAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
          </select>
        </Field>
      )}

      <Collapsible>
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始日期">
            <input type="date" className="input font-numeric" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="结束日期（可选）">
            <input type="date" className="input font-numeric" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="备注（可选）">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 25 号发放" />
        </Field>
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
