import { useState, useEffect } from 'react';
import { HeroAmount, Field, Segmented, Collapsible, FormError, FormActions } from './FormKit';

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
  onCancel,
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel?: () => void;
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
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (billingDay < 1 || billingDay > 31) { setError('扣款日必须在 1-31 之间'); return; }
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
      <HeroAmount label="订阅金额" value={amount} onChange={setAmount} tone="warning" />

      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 Netflix / Spotify / iCloud+"
        />
      </Field>

      <Field label="扣款周期">
        <Segmented
          options={[{ value: 'monthly', label: '每月' }, { value: 'yearly', label: '每年' }]}
          value={billingCycle}
          onChange={setBillingCycle}
        />
      </Field>

      <Field label="扣款日">
        <div className="relative max-w-[140px]">
          <input
            type="number" inputMode="numeric" className="input font-numeric pr-9"
            value={billingDay} onChange={(e) => setBillingDay(Number(e.target.value) || 0)}
            min="1" max="31" step="1"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-notion-text-muted">号</span>
        </div>
      </Field>

      <Collapsible>
        <Field label="分类（可选）">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">不分类</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="备注（可选）">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
