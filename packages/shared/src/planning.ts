/**
 * 长期视角的财务指标（不只看当期）：
 *   - 多期收支：本期 + 往前若干发薪周期，逐期重算收入/消费/投资
 *   - 现金可支撑月数：净可用现金 ÷ 月均生活成本
 *   - 财务自由：目标金额（年支出 ÷ 提取率）、差距、按当前储蓄速度的预计达成时间
 *
 * 往期收支用该期内某天重跑 computeDashboardV2 得到（现金余额与收支无关，传空数组即可）。
 */

import { computeDashboardV2, getCurrentCycle, addDays, parseDate } from './calc.js';
import type {
  CreditCard,
  UserConfig,
  RecurringInvestment,
  RecurringBill,
  RecurringIncome,
  Subscription,
  OneOffExpense,
} from './types.js';

/** 单个发薪周期的收支（只有聚合数字） */
export type CycleStat = {
  cycle_id: string;
  income: number;
  expense: number;  // 总支出（含投资）
  consume: number;  // 生活成本 = 信用卡 + 固定账单 + 订阅 + 临时支出（不含投资）
  invest: number;
  surplus: number;  // income - expense
  // 生活成本拆分（consume = 四项之和）
  card: number;
  bills: number;
  subscriptions: number;
  oneOff: number;
};

export type CycleAgg = {
  n: number;
  from: string;
  to: string;
  income: number;   // 区间合计
  expense: number;
  consume: number;
  invest: number;
  surplus: number;
  avgIncome: number;  // 每期平均
  avgExpense: number;
  avgConsume: number;
  avgInvest: number;
  avgSurplus: number;
  deficitCycles: number; // 透支（结余<0）的期数
};

export const DEFAULT_WINDOW_CYCLES = 6;

/**
 * 用户开始记账的大致日期：配置创建、最早快照、最早信用卡账单月、最早临时支出中最早的一个。
 * 早于此的周期不计入（否则固定收支会被"复制"到用户还没用本应用的月份，虚增期数）
 */
export function earliestDataDate(
  configCreatedAt: number | null | undefined,
  firstSnapshot: string | null | undefined,
  cards: Pick<CreditCard, 'monthly_statements'>[],
  oneOffs: Pick<OneOffExpense, 'date'>[],
): Date {
  const candidates: Date[] = [];
  if (configCreatedAt) candidates.push(new Date(configCreatedAt));
  if (firstSnapshot) candidates.push(parseDate(firstSnapshot));
  for (const card of cards) {
    const stmts = card.monthly_statements;
    if (!stmts || typeof stmts !== 'object') continue;
    for (const k of Object.keys(stmts)) {
      if (/^\d{4}-\d{2}$/.test(k)) candidates.push(parseDate(`${k}-01`));
    }
  }
  for (const o of oneOffs) {
    if (typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) candidates.push(parseDate(o.date));
  }
  const valid = candidates.filter((d) => !Number.isNaN(d.getTime()));
  if (valid.length === 0) return new Date();
  return new Date(Math.min(...valid.map((d) => d.getTime())));
}

export type CycleHistoryInput = {
  today: Date;
  config: UserConfig;
  cards: CreditCard[];
  investments: RecurringInvestment[];
  bills: RecurringBill[];
  incomes: RecurringIncome[];
  subscriptions: Subscription[];
  oneOffs: OneOffExpense[];
  /** 不早于此日期所在的周期（见 earliestDataDate） */
  dataStart: Date;
  maxCycles?: number;
};

/** 本期 + 往前最多 maxCycles-1 期的收支，按时间升序 */
export function computeCycleHistory(input: CycleHistoryInput): CycleStat[] {
  const { today, config, dataStart } = input;
  const maxCycles = input.maxCycles ?? DEFAULT_WINDOW_CYCLES;
  const calcAt = (d: Date) =>
    computeDashboardV2(
      d, config, [], input.cards, [],
      input.investments, input.bills, input.incomes, input.subscriptions, input.oneOffs,
    );
  const startMidnight = new Date(dataStart.getFullYear(), dataStart.getMonth(), dataStart.getDate());

  const out: CycleStat[] = [cycleStat(calcAt(today))];
  let cycleStart = getCurrentCycle(today, config.pay_day).start_date;
  for (let i = 1; i < maxCycles; i++) {
    const d = addDays(cycleStart, -1); // 上一期的最后一天
    if (d < startMidnight) break;      // 整期都在开始记账之前
    out.push(cycleStat(calcAt(d)));
    cycleStart = getCurrentCycle(d, config.pay_day).start_date;
  }
  return out.reverse();
}

export function cycleStat(calc: ReturnType<typeof computeDashboardV2>): CycleStat {
  const ue = calc.upcoming_expenses;
  const consume = (ue?.total_credit_card ?? 0) + (ue?.total_bills ?? 0) + (ue?.total_subscriptions ?? 0) + (ue?.total_one_off ?? 0);
  return {
    cycle_id: calc.cycle_id,
    income: Math.round(calc.total_income),
    expense: Math.round(calc.total_expense),
    consume: Math.round(consume),
    invest: Math.round(ue?.total_investments ?? 0),
    surplus: Math.round(calc.total_income - calc.total_expense),
    card: Math.round(ue?.total_credit_card ?? 0),
    bills: Math.round(ue?.total_bills ?? 0),
    subscriptions: Math.round(ue?.total_subscriptions ?? 0),
    oneOff: Math.round(ue?.total_one_off ?? 0),
  };
}

export function aggregateCycles(cycles: CycleStat[]): CycleAgg {
  const n = cycles.length;
  const sum = (k: keyof Omit<CycleStat, 'cycle_id'>) => cycles.reduce((s, c) => s + c[k], 0);
  const income = sum('income');
  const expense = sum('expense');
  const consume = sum('consume');
  const invest = sum('invest');
  const surplus = sum('surplus');
  const avg = (v: number) => (n > 0 ? Math.round(v / n) : 0);
  return {
    n,
    from: cycles[0]?.cycle_id ?? '',
    to: cycles[n - 1]?.cycle_id ?? '',
    income, expense, consume, invest, surplus,
    avgIncome: avg(income),
    avgExpense: avg(expense),
    avgConsume: avg(consume),
    avgInvest: avg(invest),
    avgSurplus: avg(surplus),
    deficitCycles: cycles.filter((c) => c.surplus < 0).length,
  };
}

/** 现金可支撑月数（保留 1 位小数）；月均生活成本为 0 时返回 null */
export function runwayMonths(cash: number, monthlyLivingCost: number): number | null {
  if (!(monthlyLivingCost > 0)) return null;
  return Math.max(0, Math.round((cash / monthlyLivingCost) * 10) / 10);
}

// ── 财务自由 ─────────────────────────────────────────────────────

export type FireInput = {
  /** 当前可投资净资产（现金 + 其他资产） */
  currentAssets: number;
  /** 财务自由后的年支出 */
  annualSpend: number;
  /** 安全提取率 %，如 4 = 4% 法则（目标 = 年支出 × 25） */
  withdrawalRatePct: number;
  /** 预期年化收益 %（实际收益，已扣通胀） */
  annualReturnPct: number;
  /** 每月新增储蓄（收入 − 生活成本，含定投） */
  monthlyContribution: number;
};

export type FireResult = {
  target: number;
  gap: number;            // 还差多少（≤0 表示已达成）
  progressPct: number;    // 0-100
  reached: boolean;
  /** 预计还需多少个月；已达成为 0；按当前速度 100 年内达不到为 null */
  monthsToGoal: number | null;
};

const MAX_MONTHS = 100 * 12;

export function computeFire(input: FireInput): FireResult {
  const rate = input.withdrawalRatePct / 100;
  const target = rate > 0 && input.annualSpend > 0 ? Math.round(input.annualSpend / rate) : 0;
  const current = Math.max(0, input.currentAssets);
  const gap = target - current;
  const reached = target > 0 && gap <= 0;
  const progressPct = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 1000) / 10)) : 0;

  let monthsToGoal: number | null = null;
  if (target <= 0) {
    monthsToGoal = null;
  } else if (reached) {
    monthsToGoal = 0;
  } else {
    // 按月复利 + 每月定额投入，逐月推演
    const r = Math.pow(1 + input.annualReturnPct / 100, 1 / 12) - 1;
    let a = current;
    for (let m = 1; m <= MAX_MONTHS; m++) {
      a = a * (1 + r) + input.monthlyContribution;
      if (a >= target) { monthsToGoal = m; break; }
      if (a <= 0 && input.monthlyContribution <= 0) break; // 资产耗尽且没有新增
    }
  }
  return { target, gap: Math.round(gap), progressPct, reached, monthsToGoal };
}
