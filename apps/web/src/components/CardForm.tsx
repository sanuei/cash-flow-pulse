import { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { MoneyInput } from './MoneyInput';
import { Field, Collapsible, FormError, FormActions } from './FormKit';

type FormData = {
  name: string;
  statement_amount: number;
  due_day: number;
  monthly_statements?: Record<string, number>;
};

// _key 是纯前端本地稳定标识（不落库），避免用数组下标当 React key——
// 一旦引入"近期/更早"分组显示，下标会随分组/排序变化，用下标当 key 会导致
// 行内部状态（如输入焦点）错位到别的行上
type MonthRow = { _key: number; month: string; amount: number };

// Record<YYYY-MM, number> → 按月份排序的行数组
function toRows(map: Record<string, number> | undefined, nextKey: () => number): MonthRow[] {
  if (!map) return [];
  return Object.entries(map)
    .map(([month, amount]) => ({ _key: nextKey(), month, amount }))
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

// 按月份字符串取"最晚"的一行（不依赖数组顺序，避免手动改月份后顺序错乱）
function latestRow(rows: MonthRow[]): MonthRow | undefined {
  return rows.reduce<MonthRow | undefined>((max, r) => (!max || r.month > max.month ? r : max), undefined);
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
  const keyCounter = useRef(0);
  const nextKey = () => ++keyCounter.current;

  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.statement_amount ?? 0);
  const [dueDay, setDueDay] = useState(initial?.due_day ?? 25);
  const [rows, setRows] = useState<MonthRow[]>(toRows(initial?.monthly_statements, nextKey));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setAmount(initial.statement_amount);
      setDueDay(initial.due_day);
      setRows(toRows(initial.monthly_statements, nextKey));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // 添加一行：空表→当月；否则→"月份最晚"那一行的下个月（不依赖数组顺序）。
  // 金额沿用该行 / 默认值
  const addRow = () => {
    setRows((r) => {
      const latest = latestRow(r);
      const month = latest ? shiftMonth(latest.month, 1) : currentMonth();
      const prefill = latest ? latest.amount : amount;
      return [...r, { _key: nextKey(), month, amount: prefill }];
    });
  };
  const updateRow = (key: number, patch: Partial<MonthRow>) =>
    setRows((r) => r.map((row) => (row._key === key ? { ...row, ...patch } : row)));
  const removeRow = (key: number) => setRows((r) => r.filter((row) => row._key !== key));

  // 重复月份检测：同一月份出现 ≥2 次时，之前是静默丢弃、只留最后一条——
  // 现在改为在行上高亮提示 + 阻止保存，避免辛苦填的金额无声消失
  const monthCounts = new Map<string, number>();
  for (const row of rows) monthCounts.set(row.month, (monthCounts.get(row.month) ?? 0) + 1);
  const duplicateMonths = [...monthCounts.entries()].filter(([, n]) => n > 1).map(([m]) => m);

  const cm = currentMonth();
  const recentRows = rows.filter((r) => r.month >= cm).sort((a, b) => a.month.localeCompare(b.month));
  const olderRows = rows.filter((r) => r.month < cm).sort((a, b) => a.month.localeCompare(b.month));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (dueDay < 1 || dueDay > 31) { setError('扣款日必须在 1-31 之间'); return; }
    if (duplicateMonths.length > 0) {
      setError(`月份重复：${duplicateMonths.join('、')} 各出现了多次，请合并或删除多余的行`);
      return;
    }
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

  const renderRow = (row: MonthRow) => {
    const isDup = duplicateMonths.includes(row.month);
    return (
      <div key={row._key} className="flex items-center gap-2">
        <input
          type="month"
          className={`input font-numeric flex-1 min-w-0 ${isDup ? 'border-[var(--c-warning)]' : ''}`}
          value={row.month}
          onChange={(e) => updateRow(row._key, { month: e.target.value })}
          aria-label="月份"
        />
        <div className="flex-1 min-w-0">
          <MoneyInput value={row.amount} onChange={(n) => updateRow(row._key, { amount: n })} ariaLabel="该月账单金额" />
        </div>
        <button
          type="button"
          onClick={() => removeRow(row._key)}
          className="flex-shrink-0 p-2 rounded-[var(--radius-sm)] text-notion-text-muted hover:text-notion-warning hover:bg-[var(--c-warning-soft)] transition-colors"
          aria-label="删除该月"
        >
          <Icon name="close" size={15} strokeWidth={1.75} />
        </button>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 按月账单：主区，置顶（信用卡本质按月记账，最常改的就是这里）*/}
      <div>
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
          <div className="mt-3 space-y-3">
            {recentRows.length > 0 && (
              <div className="space-y-2">{recentRows.map(renderRow)}</div>
            )}
            {olderRows.length > 0 && (
              <Collapsible label={`更早的月份 (${olderRows.length})`} defaultOpen={recentRows.length === 0}>
                <div className="space-y-2">{olderRows.map(renderRow)}</div>
              </Collapsible>
            )}
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

      {/* 卡片设置：名称/扣款日 —— 一次性设定，不常改，收在下方 */}
      <div className="border-t border-[var(--c-border)] pt-4 space-y-4">
        <Field label="名称">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如 乐天卡 / 三井住友"
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
      </div>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
