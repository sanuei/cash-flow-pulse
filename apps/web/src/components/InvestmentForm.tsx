import { useState, useEffect } from 'react';
import { HeroAmount, Field, Segmented, Collapsible, FormError, FormActions } from './FormKit';

// single(临时投资)由独立「临时投资」卡片用 OneOffForm 处理，这里只做循环频率
type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'single';

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

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

// 编辑已有投资时改了金额/频率：
//   'from' → 从 effective_from 起生效：旧记录在该日截止（保留历史），新规则从该日开始
//   'all'  → 直接改这条记录（之前录错了，历史一起改）
export type ChangeScope = { mode: 'from'; effective_from: string } | { mode: 'all' };

// 本地日期 YYYY-MM-DD（不用 toISOString，避免日本时间早上被算成前一天）
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function InvestmentForm({
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
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'daily');
  const [payDay, setPayDay] = useState(initial?.pay_day ?? 1);
  const [dayOfWeek, setDayOfWeek] = useState(initial?.day_of_week ?? 1);
  const [startDate, setStartDate] = useState(
    initial?.start_date ?? new Date().toISOString().split('T')[0]!
  );
  const [endDate, setEndDate] = useState(initial?.end_date ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [scopeMode, setScopeMode] = useState<'from' | 'all'>('from');
  const [effectiveFrom, setEffectiveFrom] = useState(todayLocal());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setAmount(initial.amount);
      setFrequency(initial.frequency);
      setPayDay(initial.pay_day ?? 1);
      setDayOfWeek(initial.day_of_week ?? 1);
      setStartDate(initial.start_date);
      setEndDate(initial.end_date ?? '');
      setNote(initial.note ?? '');
    }
  }, [initial]);

  // 编辑一条「已经开始扣款」的投资，并改了扣款规则 → 需要问清楚改动从哪天起算
  const ruleChanged = !!initial && (
    amount !== initial.amount ||
    frequency !== initial.frequency ||
    (frequency === 'monthly' && payDay !== initial.pay_day) ||
    (frequency === 'weekly' && dayOfWeek !== initial.day_of_week)
  );
  const hasHistory = !!initial && initial.start_date < todayLocal();
  const askScope = ruleChanged && hasHistory;
  const fromMode = askScope && scopeMode === 'from';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('名称不能为空'); return; }
    if (fromMode) {
      if (!effectiveFrom) { setError('请选择生效日期'); return; }
      if (effectiveFrom <= initial!.start_date) { setError(`生效日期需晚于开始日期 ${initial!.start_date}；若要连历史一起改，选「修改全部历史」`); return; }
      if (initial!.end_date && effectiveFrom >= initial!.end_date) { setError(`生效日期需早于结束日期 ${initial!.end_date}`); return; }
    }
    // 「从某天起」允许金额为 0 = 从该日起暂停扣款
    if (amount < 0 || (amount === 0 && !fromMode)) { setError('金额必须大于 0'); return; }
    if (!startDate) { setError('开始日期必填'); return; }
    if (frequency === 'monthly' && (payDay < 1 || payDay > 31)) { setError('扣款日必须在 1-31 之间'); return; }
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
      }, askScope ? (scopeMode === 'from' ? { mode: 'from', effective_from: effectiveFrom } : { mode: 'all' }) : undefined);
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

      {askScope && (
        <div className="rounded-[var(--radius-md)] border border-[var(--c-border)] p-3 space-y-3">
          <Field
            label="这次修改从哪天起算？"
            hint={scopeMode === 'from'
              ? '之前的扣款记录保持原金额不变，只有生效日及之后按新设置计算。金额填 0 = 从该日起暂停。'
              : '这条投资从开始日期起的所有历史都会按新设置重算，仅在之前录错时使用。'}
          >
            <Segmented
              options={[
                { value: 'from' as const, label: '从某天起生效' },
                { value: 'all' as const, label: '修改全部历史' },
              ]}
              value={scopeMode}
              onChange={setScopeMode}
            />
          </Field>
          {scopeMode === 'from' && (
            <Field label="生效日期">
              <input type="date" className="input font-numeric max-w-[200px]" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </Field>
          )}
        </div>
      )}

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

      {frequency === 'monthly' && (
        <Field label="每月扣款日" hint="大于当月天数按月末扣款（如 31 → 2 月 28）">
          <div className="relative max-w-[140px]">
            <input
              type="number" inputMode="numeric" className="input font-numeric pr-9"
              value={payDay || ''} onChange={(e) => setPayDay(Number(e.target.value) || 0)}
              onFocus={(e) => e.currentTarget.select()}
              min="1" max="31" step="1"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-notion-text-muted">号</span>
          </div>
        </Field>
      )}
      {frequency === 'weekly' && (
        <Field label="每周扣款日">
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
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 每月 15 号执行" />
        </Field>
      </Collapsible>

      <FormError msg={error} />
      <FormActions onCancel={onCancel} saving={saving} disabled={!name.trim()} />
    </form>
  );
}
