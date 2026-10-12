import { useState, useEffect } from 'react';
import { HeroAmount, Field, Segmented, Collapsible, FormError, FormActions } from './FormKit';
import { useEffectiveScope, EffectiveScopeField, type ChangeScope } from './EffectiveScope';

type Cycle = 'monthly' | 'yearly';

type FormData = {
  name: string;
  amount: number;
  billing_day: number;
  billing_cycle: Cycle;
  category: string | null;
  start_date: string | null; // 生效区间 [start_date, end_date)，null=不限
  end_date: string | null;
  note: string | null;
};

const CATEGORIES = ['影音', '工具', '云存储', 'AI', '教育', '其他'];

export function SubscriptionForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: FormData;
  onSubmit: (data: FormData, scope?: ChangeScope) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [billingDay, setBillingDay] = useState(initial?.billing_day ?? 15);
  const [billingCycle, setBillingCycle] = useState<Cycle>(initial?.billing_cycle ?? 'monthly');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [endDate, setEndDate] = useState(initial?.end_date ?? '');
  const scopeState = useEffectiveScope({
    editing: !!initial,
    ruleChanged: !!initial && (amount !== initial.amount || billingDay !== initial.billing_day || billingCycle !== initial.billing_cycle),
    startDate: initial?.start_date,
    endDate: initial?.end_date,
  });
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
      setStartDate(initial.start_date ?? '');
      setEndDate(initial.end_date ?? '');
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (billingDay < 1 || billingDay > 31) { setError('扣款日必须在 1-31 之间'); return; }
    if (startDate && endDate && endDate <= startDate) { setError('结束日期需晚于开始日期'); return; }
    const scopeError = scopeState.validate();
    if (scopeError) { setError(scopeError); return; }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        amount,
        billing_day: billingDay,
        billing_cycle: billingCycle,
        category: category || null,
        start_date: startDate || null,
        end_date: endDate || null,
        note: note.trim() || null,
      }, scopeState.scope());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <HeroAmount label="订阅金额" value={amount} onChange={setAmount} tone="warning" />

      <EffectiveScopeField state={scopeState} />

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
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始日期（可选）">
            <input type="date" className="input font-numeric" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="结束日期（可选）">
            <input type="date" className="input font-numeric" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="备注（可选）">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
