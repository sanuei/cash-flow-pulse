import { useState, useEffect } from 'react';
import { HeroAmount, Field, Segmented, Collapsible, FormError, FormActions } from './FormKit';

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
  onCancel,
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel?: () => void;
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
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (amount <= 0) { setError('金额必须大于 0'); return; }
    if (!startDate) { setError('开始日期必填'); return; }
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
      <HeroAmount label="投资金额（每次）" value={amount} onChange={setAmount} tone="accent" />

      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 基金定投 / 黄金积存"
        />
      </Field>

      <Field label="频率" hint="按周期内发生次数自动计算总额">
        <Segmented options={freqOptions} value={frequency} onChange={setFrequency} />
      </Field>

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
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 每月 15 号执行" />
        </Field>
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
