import { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { MoneyInput } from './MoneyInput';
import { Field, FormError, FormActions } from './FormKit';

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

// YYYY-MM 加 n 个月
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y!, (m! - 1) + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

  // 添加一行：空表→当月；否则→最后一行的下个月。金额沿用最近一行 / 默认值
  const addRow = () => {
    setRows((r) => {
      const month = r.length > 0 ? shiftMonth(r[r.length - 1]!.month, 1) : currentMonth();
      const prefill = r.length > 0 ? r[r.length - 1]!.amount : amount;
      return [...r, { month, amount: prefill }];
    });
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
      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如 乐天卡 / 三井住友"
          autoFocus
        />
      </Field>

      <Field label="每月扣款日" hint="大于当月天数则按月末（如 31 → 2 月 28）">
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

      {/* 按月账单：主区，常驻展开（信用卡本质按月记账，这里是主角） */}
      <div className="border-t border-[var(--c-border)] pt-4">
        <div className="flex items-center justify-between mb-1">
          <div>
            <span className="text-[13px] font-semibold text-notion-text">按月账单</span>
            <p className="text-[12px] text-notion-text-muted mt-0.5">逐月填写每期实际账单金额</p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 flex-shrink-0 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[12px] font-semibold text-[var(--c-accent-text)] bg-[var(--c-accent-soft)] hover:bg-[var(--c-accent)] hover:text-[var(--c-text-on-accent)] transition-colors"
          >
            <Icon name="add" size={13} strokeWidth={2} />
            <span>添加月份</span>
          </button>
        </div>

        {rows.length > 0 ? (
          <div className="space-y-2 mt-3">
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
        ) : (
          <button
            type="button"
            onClick={addRow}
            className="w-full mt-3 py-3 rounded-[var(--radius-md)] border border-dashed border-[var(--c-border)] text-[13px] text-notion-text-muted hover:border-[var(--c-accent)] hover:text-[var(--c-accent-text)] transition-colors"
          >
            还没有账单，点此添加本月
          </button>
        )}
      </div>

      {/* 默认账单金额：次要兜底，放在最后（未单独填写的月份沿用此值，也用于预测未来月） */}
      <Field
        label="默认账单金额"
        hint="未在上方单独填写的月份，按此金额估算（可留空）"
        className="border-t border-[var(--c-border)] pt-4"
      >
        <div className="max-w-[200px]">
          <MoneyInput value={amount} onChange={setAmount} ariaLabel="默认账单金额" />
        </div>
      </Field>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
