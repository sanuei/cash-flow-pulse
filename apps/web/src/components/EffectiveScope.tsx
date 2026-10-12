import { useState } from 'react';
import { Field, Segmented } from './FormKit';

/**
 * 「这次修改从哪天起算？」—— 固定投资 / 固定账单 / 订阅共用。
 *
 * 这些条目都是一条「规则」，往期金额按当前规则重算。直接改金额会把历史一起改掉，所以
 * 编辑一条已经开始扣款的条目、且改了扣款规则（金额/扣款日/频率）时，让用户选：
 *   'from' → 从 effective_from 起生效：旧记录在该日截止（保留历史），新规则从该日开始
 *   'all'  → 直接改这条记录（之前录错了，历史一起改）
 */
export type ChangeScope = { mode: 'from'; effective_from: string } | { mode: 'all' };

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免日本时间早上被算成前一天） */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** end_date 是开区间上界：end_date 当天及之后不再扣款 */
export function isEnded(item: { end_date?: string | null }, today = todayLocal()): boolean {
  return !!item.end_date && item.end_date <= today;
}

export function useEffectiveScope({
  editing,
  ruleChanged,
  startDate,
  endDate,
}: {
  /** 是否在编辑已有条目 */
  editing: boolean;
  /** 金额/扣款日/频率是否改了 */
  ruleChanged: boolean;
  /** 原记录的开始日期；null = 不限（一直有效） */
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}) {
  const [mode, setMode] = useState<'from' | 'all'>('from');
  const [effectiveFrom, setEffectiveFrom] = useState(todayLocal());
  const hasHistory = !startDate || startDate < todayLocal();
  const ask = editing && ruleChanged && hasHistory;
  const fromMode = ask && mode === 'from';

  return {
    ask,
    fromMode,
    mode, setMode,
    effectiveFrom, setEffectiveFrom,
    /** 提交前校验；返回错误文案或 null */
    validate(): string | null {
      if (!fromMode) return null;
      if (!effectiveFrom) return '请选择生效日期';
      if (startDate && effectiveFrom <= startDate) return `生效日期需晚于开始日期 ${startDate}；若要连历史一起改，选「修改全部历史」`;
      if (endDate && effectiveFrom >= endDate) return `生效日期需早于结束日期 ${endDate}`;
      return null;
    },
    scope(): ChangeScope | undefined {
      if (!ask) return undefined;
      return mode === 'from' ? { mode: 'from', effective_from: effectiveFrom } : { mode: 'all' };
    },
  };
}

export function EffectiveScopeField({ state }: { state: ReturnType<typeof useEffectiveScope> }) {
  if (!state.ask) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--c-border)] p-3 space-y-3">
      <Field
        label="这次修改从哪天起算？"
        hint={state.mode === 'from'
          ? '之前的扣款保持原金额不变，只有生效日及之后按新设置计算。金额填 0 = 从该日起暂停。'
          : '从开始日期起的所有历史都会按新设置重算，仅在之前录错时使用。'}
      >
        <Segmented
          options={[
            { value: 'from' as const, label: '从某天起生效' },
            { value: 'all' as const, label: '修改全部历史' },
          ]}
          value={state.mode}
          onChange={state.setMode}
        />
      </Field>
      {state.mode === 'from' && (
        <Field label="生效日期">
          <input
            type="date"
            className="input font-numeric max-w-[200px]"
            value={state.effectiveFrom}
            onChange={(e) => state.setEffectiveFrom(e.target.value)}
          />
        </Field>
      )}
    </div>
  );
}

/**
 * 按生效范围保存一条已有记录：
 *   from → 旧记录 end_date = 生效日；金额 > 0 时再新建一条从生效日开始的记录
 *   all / 未询问 → 直接更新
 */
export async function saveWithScope<T extends { amount: number; start_date?: string | null; end_date?: string | null }>(
  data: T,
  scope: ChangeScope | undefined,
  update: (patch: Partial<T>) => Promise<void>,
  create: (data: T) => Promise<void>,
) {
  if (scope?.mode === 'from') {
    const from = scope.effective_from;
    await update({ end_date: from } as Partial<T>);
    if (data.amount > 0) await create({ ...data, start_date: from });
    return;
  }
  await update(data);
}
