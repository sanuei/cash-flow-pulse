import { useState, useEffect } from 'react';
import { HeroAmount, Field, Collapsible, FormError, FormActions } from './FormKit';

type FormData = {
  name: string;
  amount: number;
  date: string;       // YYYY-MM-DD
  note: string | null;
};

type Tone = 'neutral' | 'success' | 'warning' | 'accent';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 通用「一次性/临时」表单（金额 + 名称 + 日期 + 备注）
// 临时账单/临时收入/临时投资三处复用，用 amountLabel/tone/namePlaceholder 区分语气
export function OneOffForm({
  initial,
  onSubmit,
  onCancel,
  amountLabel = '支出金额',
  tone = 'warning',
  namePlaceholder = '如 换轮胎 / 朋友聚餐 / 家电',
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel?: () => void;
  amountLabel?: string;
  tone?: Tone;
  namePlaceholder?: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [date, setDate] = useState(initial?.date ?? today());
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setAmount(initial.amount);
      setDate(initial.date);
      setNote(initial.note ?? '');
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('请选择日期'); return; }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), amount, date, note: note.trim() || null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <HeroAmount label={amountLabel} value={amount} onChange={setAmount} tone={tone} />

      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={namePlaceholder}
        />
      </Field>

      <Field label="日期" hint="按此日期归入对应发薪周期，并落在现金流曲线上">
        <input
          type="date"
          className="input font-numeric max-w-[200px]"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="日期"
        />
      </Field>

      <Collapsible>
        <Field label="备注（可选）">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 一次性" />
        </Field>
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
