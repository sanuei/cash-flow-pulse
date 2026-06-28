import { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { MoneyInput } from './MoneyInput';
import { HeroAmount, Field, Collapsible, FormError, FormActions } from './FormKit';

type FormData = {
  name: string;
  statement_amount: number;
  due_day: number;
  monthly_statements?: Record<string, number>;
};

type MonthRow = { month: string; amount: number };

// Record<YYYY-MM, number> → 按月份排序的行数组
function toRows(map?: Record<string, number>): MonthRow[] {
  if (!map) return [];
  return Object.entries(map)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function CardForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: FormData;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.statement_amount ?? 0);
  const [dueDay, setDueDay] = useState(initial?.due_day ?? 25);
  const [rows, setRows] = useState<MonthRow[]>(toRows(initial?.monthly_statements));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setAmount(initial.statement_amount);
      setDueDay(initial.due_day);
      setRows(toRows(initial.monthly_statements));
    }
  }, [initial]);

  const addRow = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setRows((r) => [...r, { month: ym, amount: amount }]);
  };
  const updateRow = (i: number, patch: Partial<MonthRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (dueDay < 1 || dueDay > 31) { setError('扣款日必须在 1-31 之间'); return; }
    const map: Record<string, number> = {};
    for (const row of rows) {
      if (!row.month) continue;
      if (!/^\d{4}-\d{2}$/.test(row.month)) { setError(`月份格式有误：${row.month}`); return; }
      map[row.month] = row.amount || 0;
    }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), statement_amount: amount, due_day: dueDay, monthly_statements: map });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <HeroAmount label="默认账单金额" value={amount} onChange={setAmount} tone="warning" />

      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 乐天卡 / 三井住友"
        />
      </Field>

      <Field label="每月扣款日" hint="大于当月天数则按月末（如 31 → 2 月 28）；未单独设置的月份用默认金额">
        <div className="relative max-w-[140px]">
          <input
            type="number" inputMode="numeric" className="input font-numeric pr-9"
            value={dueDay} onChange={(e) => setDueDay(Number(e.target.value) || 0)}
            min="1" max="31" step="1"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-notion-text-muted">号</span>
        </div>
      </Field>

      <Collapsible label="按月账单（不同月份金额不同时）" defaultOpen={rows.length > 0}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-notion-text-secondary">为指定月份单独填金额，其余沿用默认</span>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 text-[12px] font-semibold text-[var(--c-accent-text)] hover:text-[var(--c-accent)] transition-colors"
          >
            <Icon name="add" size={13} strokeWidth={2} />
            <span>添加月份</span>
          </button>
        </div>
        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="month"
                  className="input font-numeric flex-1 min-w-0"
                  value={row.month}
                  onChange={(e) => updateRow(i, { month: e.target.value })}
                  aria-label="月份"
                />
                <div className="flex-1 min-w-0">
                  <MoneyInput value={row.amount} onChange={(n) => updateRow(i, { amount: n })} ariaLabel="该月账单金额" />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="flex-shrink-0 p-2 rounded-[var(--radius-sm)] text-notion-text-muted hover:text-notion-warning hover:bg-[var(--c-warning-soft)] transition-colors"
                  aria-label="删除该月"
                >
                  <Icon name="close" size={15} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
