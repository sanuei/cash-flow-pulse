/**
 * 闲置资金怎么投：按用户自己设定的目标配置比例，把「超出应急金的现金」分配到各类别。
 *
 *   应急金线   = 月均生活成本 × 应急月数（默认 6）
 *   闲置资金   = 净可用现金 − 应急金线（≤ 0 → 不建议投入）
 *   投入后总额 = 各类别当前市值 + 闲置资金
 *   各类别目标 = 投入后总额 × 目标比例
 *   建议投入   = 先补「目标 − 当前」缺口最大的类别（只买不卖）；缺口都补齐后剩下的按目标比例分
 *
 * 只按用户设定的比例做算术，不推荐具体标的。
 */

export interface AllocationTarget {
  key: string;     // 类别 key（持仓的 bucket 字段引用它）
  label: string;   // 如「美股指数基金」「特斯拉」
  pct: number;     // 目标占比 %（各项合计 100）
}

export const DEFAULT_ALLOCATION_TARGETS: AllocationTarget[] = [
  { key: 'us_index', label: '美股大盘/指数基金', pct: 50 },
  { key: 'tsla', label: '特斯拉', pct: 30 },
  { key: 'others', label: '其他基金/个股', pct: 20 },
];

export const DEFAULT_EMERGENCY_MONTHS = 6;

export type AllocationLine = {
  key: string;
  label: string;
  targetPct: number;
  current: number;      // 当前市值（日元）
  currentPct: number;   // 当前占比（按已分类持仓合计）
  target: number;       // 投入闲置资金后的目标市值
  suggest: number;      // 建议投入金额（日元，取整到 1,000）
};

export type IdleCashAdvice = {
  emergencyTarget: number;   // 应急金线
  idle: number;              // 闲置资金（可能为负 = 应急金还差多少）
  lines: AllocationLine[];
  unassigned: number;        // 没分类的持仓市值（不参与比例计算）
};

const round1000 = (n: number) => Math.round(n / 1000) * 1000;

export function computeIdleCashAdvice(opts: {
  cash: number;                       // 净可用现金
  monthlyLivingCost: number;          // 月均生活成本
  emergencyMonths?: number;
  targets: AllocationTarget[];
  currentByBucket: Record<string, number>; // bucket key → 当前市值；未分类用 '' 或不存在的 key
}): IdleCashAdvice {
  const months = opts.emergencyMonths ?? DEFAULT_EMERGENCY_MONTHS;
  const emergencyTarget = Math.round(Math.max(0, opts.monthlyLivingCost) * months);
  const idle = Math.round(opts.cash - emergencyTarget);

  const keys = new Set(opts.targets.map((t) => t.key));
  const unassigned = Object.entries(opts.currentByBucket)
    .filter(([k]) => !keys.has(k))
    .reduce((s, [, v]) => s + v, 0);

  const pctSum = opts.targets.reduce((s, t) => s + Math.max(0, t.pct), 0) || 1;
  const currentTotal = opts.targets.reduce((s, t) => s + (opts.currentByBucket[t.key] ?? 0), 0);
  const budget = Math.max(0, idle);
  const after = currentTotal + budget;

  const base = opts.targets.map((t) => {
    const current = opts.currentByBucket[t.key] ?? 0;
    const share = Math.max(0, t.pct) / pctSum;
    return { t, current, share, target: after * share, gap: Math.max(0, after * share - current) };
  });

  // 先按缺口比例补缺口；预算比缺口总和多时，多出的部分按目标比例分
  const gapSum = base.reduce((s, b) => s + b.gap, 0);
  const raw = base.map((b) => {
    if (budget <= 0) return 0;
    if (gapSum >= budget) return gapSum > 0 ? budget * (b.gap / gapSum) : 0;
    return b.gap + (budget - gapSum) * b.share;
  });

  // 取整到 1,000 日元，误差记到建议金额最大的那一项，保证合计 = 闲置资金（取整后）
  const rounded = raw.map(round1000);
  const diff = round1000(budget) - rounded.reduce((s, v) => s + v, 0);
  if (diff !== 0 && rounded.length > 0) {
    const i = raw.indexOf(Math.max(...raw));
    rounded[i] = Math.max(0, rounded[i]! + diff);
  }

  return {
    emergencyTarget,
    idle,
    unassigned: Math.round(unassigned),
    lines: base.map((b, i) => ({
      key: b.t.key,
      label: b.t.label,
      targetPct: b.t.pct,
      current: Math.round(b.current),
      currentPct: currentTotal > 0 ? Math.round((b.current / currentTotal) * 1000) / 10 : 0,
      target: Math.round(b.target),
      suggest: rounded[i]!,
    })),
  };
}
