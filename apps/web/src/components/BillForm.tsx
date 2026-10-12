import { useState, useEffect } from 'react';
import { HeroAmount, Field, Collapsible, FormError, FormActions } from './FormKit';
import { useEffectiveScope, EffectiveScopeField, type ChangeScope } from './EffectiveScope';

type FormData = {
  name: string;
  amount: number;
  due_day: number;
  start_date: string | null; // 生效区间 [start_date, end_date)，null=不限
  end_date: string | null;
  note: string | null;
};

export function BillForm({
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
  const [dueDay, setDueDay] = useState(initial?.due_day ?? 1);
  const [note, setNote] = useState(initial?.note ?? '');
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [endDate, setEndDate] = useState(initial?.end_date ?? '');
  const scopeState = useEffectiveScope({
    editing: !!initial,
    ruleChanged: !!initial && (amount !== initial.amount || dueDay !== initial.due_day),
    startDate: initial?.start_date,
    endDate: initial?.end_date,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setAmount(initial.amount);
      setDueDay(initial.due_day);
      setNote(initial.note ?? '');
      setStartDate(initial.start_date ?? '');
      setEndDate(initial.end_date ?? '');
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (dueDay < 1 || dueDay > 31) { setError('扣款日必须在 1-31 之间'); return; }
    if (startDate && endDate && endDate <= startDate) { setError('结束日期需晚于开始日期'); return; }
    const scopeError = scopeState.validate();
    if (scopeError) { setError(scopeError); return; }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(), amount, due_day: dueDay,
        start_date: startDate || null, end_date: endDate || null,
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
      <HeroAmount label="账单金额" value={amount} onChange={setAmount} tone="warning" />

      <EffectiveScopeField state={scopeState} />

      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 房租 / 水电 / 网费"
        />
      </Field>

      <Field label="每月扣款日" hint="大于当月天数按月末扣款（如 31 → 2 月 28）">
        <div className="relative max-w-[140px]">
          <input
            type="number" inputMode="numeric" className="input font-numeric pr-9"
            value={dueDay || ''} onChange={(e) => setDueDay(Number(e.target.value) || 0)}
            onFocus={(e) => e.currentTarget.select()}
            min="1" max="31" step="1"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-notion-text-muted">号</span>
        </div>
      </Field>

      <Collapsible>
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始日期（可选）">
            <input type="date" className="input font-numeric" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="结束日期（可选）">
            <input type="date" className="input font-numeric" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="备注（可选）">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 押一付三" />
        </Field>
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
