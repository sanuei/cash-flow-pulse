/**
 * Cash Flow Pulse - 核心计算逻辑
 *
 * 这是整个项目的"算法大脑"。所有日期、周期、活跃卡片、日均预算的计算都集中在这里。
 *
 * 设计原则：
 * 1. 纯函数：所有输入显式传入，无副作用，便于单元测试
 * 2. 时区处理：所有日期使用本地时区（用户在日本）
 * 3. 月末兼容：当月没有那一天（如 2 月没有 30 号）→ 取当月最后一天
 * 4. 数据驱动：所有配置（pay_day, snapshot_offsets）都从参数传入，不读全局
 */

import type {
  CashSource,
  CreditCard,
  UserConfig,
  DashboardCalc,
  ActiveCard,
  Snapshot,
  SnapshotPrompt,
  PayCycle,
  RecurringInvestment,
  RecurringBill,
  RecurringIncome,
  Subscription,
  UpcomingExpenseItem,
  UpcomingIncomeItem,
  UpcomingExpenses,
  UpcomingIncomes,
  InvestmentFrequency,
} from './types.js';

// ============================================================
// 基础日期工具
// ============================================================

const MS_PER_DAY = 86400000;

/** 格式化 Date 为 YYYY-MM-DD（本地时区） */
export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 解析 YYYY-MM-DD 为 Date（本地时区 00:00:00） */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${s}`);
  return new Date(y, m - 1, d);
}

/** 计算两个日期之间的天数差（b - a，向下取整，忽略时分秒） */
export function diffDays(a: Date, b: Date): number {
  const aMidnight = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bMidnight = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bMidnight.getTime() - aMidnight.getTime()) / MS_PER_DAY);
}

/** 加 N 天，返回新 Date（不修改原对象） */
export function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

/**
 * 加 N 月，处理月末溢出
 *
 * 策略：先 setDate(1) 锁到月初，再 setMonth。
 * 这样避免 setMonth 跨月时的"日期滚动"陷阱（如 1/31 setMonth(1) → 3/3）。
 * 然后 setDate(targetDay)，如果 targetDay 超过目标月天数，Date 会自动滚动到下月，再回退到目标月最后一天。
 */
export function addMonths(d: Date, n: number): Date {
  const targetDay = d.getDate();
  const result = new Date(d);
  result.setDate(1);
  result.setMonth(result.getMonth() + n);
  // 获取目标月的最后一天
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return result;
}

/** 减去 N 月 */
export function subtractMonths(d: Date, n: number): Date {
  return addMonths(d, -n);
}

// ============================================================
// 发薪日 / 周期计算
// ============================================================

/**
 * 获取指定年月的发薪日
 * @param year 年
 * @param month 月（0-indexed，即 0 = 1月）
 * @param payDay 发薪日（1-31）
 * @returns 该月发薪日 Date；若该月没有这一天（如 2/30）→ 取月末
 *
 * 注意：month 必须先规范化为 [0, 11]，但 year 不做调整（让调用方决定是否跨年）。
 */
/**
 * 工作日顺延：若日期落在周六/周日，顺延至下一个周一。
 * 仅处理周末，不含公众假期（需假期日历，暂不支持）。
 */
export function shiftToWorkday(d: Date): Date {
  const dow = d.getDay(); // 0=周日, 6=周六
  if (dow === 6) return addDays(d, 2); // 周六 → 周一
  if (dow === 0) return addDays(d, 1); // 周日 → 周一
  return d;
}

export function getPaydayInMonth(year: number, month: number, payDay: number): Date {
  // month 必须已规范化到 [0, 11]，不处理溢出（避免 12 被静默归零到 0）
  if (month < 0 || month > 11) {
    throw new Error(`Month must be 0-11, got ${month}. Use addMonths to navigate months.`);
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  const actualDay = Math.min(payDay, lastDay);
  return new Date(year, month, actualDay);
}

/**
 * 辅助：规范化 (year, month) 到合理范围，处理 12 月溢出到次年
 */
function normalizeYearMonth(year: number, month: number): { year: number; month: number } {
  const totalMonths = year * 12 + month;
  return { year: Math.floor(totalMonths / 12), month: ((totalMonths % 12) + 12) % 12 };
}

/**
 * 获取下一个发薪日
 * @param today 当前日期
 * @param payDay 发薪日（1-31）
 * @returns 下一个发薪日 Date（严格大于 today）
 */
export function getNextPayday(today: Date, payDay: number): Date {
  // 比较时使用"当天 00:00"对齐，避免时分秒影响
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const thisMonth = normalizeYearMonth(today.getFullYear(), today.getMonth());
  const thisMonthPayday = getPaydayInMonth(thisMonth.year, thisMonth.month, payDay);

  if (todayMidnight.getTime() < thisMonthPayday.getTime()) {
    return thisMonthPayday;
  }

  const nextMonth = normalizeYearMonth(thisMonth.year, thisMonth.month + 1);
  return getPaydayInMonth(nextMonth.year, nextMonth.month, payDay);
}

/**
 * 获取上一个发薪日
 */
export function getPrevPayday(today: Date, payDay: number): Date {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const thisMonth = normalizeYearMonth(today.getFullYear(), today.getMonth());
  const thisMonthPayday = getPaydayInMonth(thisMonth.year, thisMonth.month, payDay);

  if (todayMidnight.getTime() >= thisMonthPayday.getTime()) {
    return thisMonthPayday;
  }

  const prevMonth = normalizeYearMonth(thisMonth.year, thisMonth.month - 1);
  return getPaydayInMonth(prevMonth.year, prevMonth.month, payDay);
}

/**
 * 获取当前周期的元数据
 *
 * 周期定义：[prevPayday, nextPayday)
 * - 周期 ID = 上一个发薪日所在的年月（YYYY-MM）
 * - 周期起点 = prevPayday
 * - 周期终点 = nextPayday（不含）
 */
export function getCurrentCycle(today: Date, payDay: number): PayCycle {
  const nextPayday = getNextPayday(today, payDay);
  const prevPayday = subtractMonths(nextPayday, 1);
  // prevPayday 也可能是"上一个月对应日期"，如果溢出则提前
  // 但通过 getNextPayday 的对称性，这里直接用 subtractMonths 是正确的

  const cycleId = `${prevPayday.getFullYear()}-${String(prevPayday.getMonth() + 1).padStart(2, '0')}`;

  return {
    cycle_id: cycleId,
    start_date: prevPayday,
    end_date: nextPayday,
    start_date_str: formatDate(prevPayday),
    end_date_str: formatDate(nextPayday),
  };
}

/**
 * 距离下个发薪日的天数（最小为 1）
 */
export function daysToNextPayday(today: Date, payDay: number): number {
  const next = getNextPayday(today, payDay);
  const days = diffDays(today, next);
  return Math.max(1, days);
}

// ============================================================
// 卡片活跃度判断
// ============================================================

/**
 * 判断信用卡在指定周期内是否"活跃"（即需要本期还）
 *
 * 业务规则：卡片的扣款日**只可能落在周期起点所在月**，或**只可能落在周期终点所在月**。
 * - 周期 [6/10, 7/10) 起点在 6 月 → 卡片 due_day 在 6 月 → 活跃（如 6/25）
 * - 如果 due_day 比 6/10 还早（如 6/5），则属于上一周期（[5/10, 6/10)）的扣款 → 不活跃
 * - 如果 due_day 比 6/10 晚但在 7/10 之前（如 7/5），同样属于下一周期 → 不活跃
 *
 * 实现：分别尝试在周期起点所在月和终点所在月找扣款日，落在区间内才返回活跃
 */
export function isCardActiveInCycle(
  card: CreditCard,
  cycleStart: Date,
  cycleEnd: Date
): { active: boolean; dueDate: Date | null } {
  // 在周期起点所在月找扣款日（处理月末溢出）
  const monthStart = getPaydayInMonth(cycleStart.getFullYear(), cycleStart.getMonth(), card.due_day);
  if (monthStart >= cycleStart && monthStart < cycleEnd) {
    return { active: true, dueDate: monthStart };
  }

  // 在周期终点所在月找扣款日（处理跨月：周期终点是 7/10，卡 due_day=5 → 7/5）
  const monthEnd = getPaydayInMonth(cycleEnd.getFullYear(), cycleEnd.getMonth(), card.due_day);
  if (monthEnd >= cycleStart && monthEnd < cycleEnd) {
    return { active: true, dueDate: monthEnd };
  }

  return { active: false, dueDate: null };
}

/**
 * 取信用卡在指定扣款日生效的账单金额：
 * 优先用 monthly_statements[YYYY-MM]（扣款日所在年月），否则回退到 statement_amount。
 */
export function getCardAmountForDate(card: CreditCard, dueDate: Date): number {
  const ym = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
  const override = card.monthly_statements?.[ym];
  return override !== undefined ? override : card.statement_amount;
}

// ============================================================
// 仪表盘核心计算
// ============================================================

/**
 * 计算仪表盘所有数据
 *
 * 这是最核心的函数：给定今天的日期 + 配置 + 所有现金和信用卡数据，返回展示所需的全部计算结果
 */
export function computeDashboard(
  today: Date,
  config: UserConfig,
  cashSources: CashSource[],
  creditCards: CreditCard[],
  snapshots: Snapshot[] = []
): DashboardCalc & { prompt: SnapshotPrompt | null; currentSnapshots: Snapshot[] } {
  // 1. 周期
  const cycle = getCurrentCycle(today, config.pay_day);
  const daysToPayday = diffDays(today, cycle.end_date);
  const safeDays = Math.max(1, daysToPayday);

  // 2. 现金汇总
  const total_balance = cashSources.reduce((sum, c) => sum + c.balance, 0);
  const total_locked = cashSources.reduce((sum, c) => sum + c.locked_amount, 0);
  const total_net_cash = total_balance - total_locked;

  // 3. 卡片活跃判断
  const activeCards: ActiveCard[] = [];
  const inactiveCards: CreditCard[] = [];

  for (const card of creditCards) {
    const { active, dueDate } = isCardActiveInCycle(card, cycle.start_date, cycle.end_date);
    if (active && dueDate) {
      // 周末顺延：金额仍按原扣款日所在月取（顺延不跨月，月份归属不变）
      const effectiveDue = config.weekend_shift ? shiftToWorkday(dueDate) : dueDate;
      activeCards.push({
        card,
        due_date: formatDate(effectiveDue),
        days_until_due: Math.max(0, diffDays(today, effectiveDue)),
        amount: getCardAmountForDate(card, dueDate),
      });
    } else {
      inactiveCards.push(card);
    }
  }

  // 按扣款日排序（最近的在前）
  activeCards.sort((a, b) => a.days_until_due - b.days_until_due);

  // 4. 应还总额（按月覆盖后的生效金额）
  const total_due = activeCards.reduce((sum, ac) => sum + ac.amount, 0);

  // 5. 净可用 + 日均预算
  const net_available = total_net_cash - total_due;
  const daily_budget = Math.max(0, Math.floor(net_available / safeDays));

  // 6. 当前周期快照
  const currentSnapshots = snapshots.filter(s => s.cycle_id === cycle.cycle_id);

  // 7. 采集点提示
  const prompt = computeSnapshotPrompt(today, config, cycle, currentSnapshots);

  // 8. 当前是周期第几天
  const current_cycle_day = diffDays(cycle.start_date, today);

  return {
    // 元数据
    total_balance,
    total_locked,
    total_net_cash,
    active_cards: activeCards,
    inactive_cards: inactiveCards,
    total_due,
    net_available,
    days_to_payday: safeDays,
    daily_budget,
    next_payday_date: cycle.end_date_str,
    cycle_id: cycle.cycle_id,
    current_cycle_day,
    prompt,
    currentSnapshots,
  };
}

/**
 * 计算采集点提示
 *
 * 规则：当今天**正好是**某个采集点，或在它**之后 1 天内**（补录窗口），
 *      且该采集点在本周期内未录入 → 返回提示信息。
 *
 * 设计权衡：
 * - 只在"采集点当天"和"采集点 + 1 天"提示（不往前提示，避免发薪日前几天就打扰）
 * - 同一周期同一采集点已录入 → 仍提示但 exists=true（用户可更新）
 */
export function computeSnapshotPrompt(
  today: Date,
  config: UserConfig,
  cycle: PayCycle,
  existingSnapshots: Snapshot[]
): SnapshotPrompt | null {
  const dayInCycle = diffDays(cycle.start_date, today);

  // 只查找当天或"采集点当天 + 1 天补录"的窗口
  for (let i = 0; i < config.snapshot_offsets.length; i++) {
    const offset = config.snapshot_offsets[i]!;
    // 条件：今天 == 采集点 OR 今天 == 采集点 + 1（且采集点未超出周期）
    if (dayInCycle === offset || dayInCycle === offset + 1) {
      const exists = existingSnapshots.some(s => s.offset_index === i);
      return {
        cycle_id: cycle.cycle_id,
        offset_index: i,
        offset_days: offset,
        cycle_day: dayInCycle,
        exists,
      };
    }
  }

  return null;
}

/**
 * 生成快照记录（在录入快照时调用）
 *
 * 计算逻辑：基于"录入时刻"的现金和信用卡状态，生成一条快照
 */
export function generateSnapshot(
  cycleId: string,
  offsetIndex: number,
  note: string | null,
  cashSources: CashSource[],
  creditCards: CreditCard[],
  today: Date,
  payDay: number
): Omit<Snapshot, 'id' | 'created_at'> {
  const cycle = getCurrentCycle(today, payDay);
  if (cycle.cycle_id !== cycleId) {
    throw new Error(`Cycle ID mismatch: expected ${cycle.cycle_id}, got ${cycleId}`);
  }

  const calc = computeDashboard(today, { ...defaultConfig(payDay), user_id: 'default', created_at: 0, updated_at: 0 }, cashSources, creditCards);

  return {
    user_id: 'default',
    cycle_id: cycleId,
    offset_index: offsetIndex,
    snapshot_date: formatDate(today),
    total_balance: calc.total_balance,
    total_locked: calc.total_locked,
    total_due: calc.total_due,
    net_available: calc.net_available,
    daily_budget: calc.daily_budget,
    days_to_payday: calc.days_to_payday,
    note,
    data_unchanged: 0,
  };
}

/**
 * 判断新快照与上一同周期快照是否数据未变
 */
export function detectUnchanged(
  newSnapshot: Omit<Snapshot, 'id' | 'created_at' | 'data_unchanged'>,
  prevSnapshot: Snapshot | undefined
): 0 | 1 {
  if (!prevSnapshot) return 0;
  const same =
    newSnapshot.total_balance === prevSnapshot.total_balance &&
    newSnapshot.total_locked === prevSnapshot.total_locked &&
    newSnapshot.total_due === prevSnapshot.total_due;
  return same ? 1 : 0;
}

// ============================================================
// 辅助
// ============================================================

/**
 * 计算"自动快照"所用的 cycle_id 和 offset_index。
 * offset_index = 当前 cycleDay 所落入的最大已过检查点的索引。
 * 例：offsets=[0,7,14,21]，cycleDay=10 → offsetIndex=1（offset 7 已过，14 未到）
 */
export function getAutoSnapshotParams(
  today: Date,
  config: UserConfig,
): { cycleId: string; offsetIndex: number } {
  const cycle = getCurrentCycle(today, config.pay_day);
  const cycleDay = diffDays(cycle.start_date, today);
  const offsets = config.snapshot_offsets;
  let offsetIndex = 0;
  for (let i = 0; i < offsets.length; i++) {
    if ((offsets[i] ?? 0) <= cycleDay) offsetIndex = i;
  }
  return { cycleId: cycle.cycle_id, offsetIndex };
}

export function defaultConfig(payDay = 10): UserConfig {
  return {
    user_id: 'default',
    pay_day: payDay,
    snapshot_offsets: [0, 7, 14, 21],
    weekend_shift: false,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

/**
 * 金额格式化（千分位 + ¥ 前缀）
 */
export function formatYen(amount: number): string {
  return '¥' + Math.round(amount).toLocaleString('ja-JP');
}

/**
 * 日均预算格式化（带" / 日"后缀）
 */
export function formatDailyBudget(amount: number): string {
  return formatYen(amount) + ' / 日';
}

// ============================================================
// 周期对比（趋势分析用）
// ============================================================

export interface CycleComparison {
  cycle_a: string;
  cycle_b: string;
  net_available_diff: number;
  net_available_pct: number;
  daily_budget_diff: number;
  daily_budget_pct: number;
  trend: 'up' | 'down' | 'flat';
}

export function compareCycles(a: Snapshot, b: Snapshot): CycleComparison {
  const diffNA = a.net_available - b.net_available;
  const pctNA = a.net_available === 0 ? 0 : (diffNA / a.net_available) * 100;
  const diffDB = a.daily_budget - b.daily_budget;
  const pctDB = a.daily_budget === 0 ? 0 : (diffDB / a.daily_budget) * 100;
  const trend = Math.abs(diffNA) < 100 ? 'flat' : diffNA > 0 ? 'up' : 'down';
  return {
    cycle_a: a.cycle_id,
    cycle_b: b.cycle_id,
    net_available_diff: diffNA,
    net_available_pct: pctNA,
    daily_budget_diff: diffDB,
    daily_budget_pct: pctDB,
    trend,
  };
}

// ============================================================
// v0.3 新增：4 类定期事件算法
// ============================================================

/**
 * 频率 → 天数映射（粗略，用于估算本期内发生次数）
 * daily = 1, weekly = 7, monthly = 30, yearly = 365
 */
const FREQUENCY_INTERVAL_DAYS: Record<InvestmentFrequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  yearly: 365,
};

/**
 * 计算投资在指定周期内的发生次数
 *
 * @param inv 投资记录（必须有 start_date + frequency）
 * @param cycleStart 周期起点（含）
 * @param cycleEnd 周期终点（不含）
 * @returns 发生次数（≥ 0）
 *
 * 算法：
 *   - 起点 = max(cycleStart, inv.start_date)
 *   - 终点 = min(cycleEnd, inv.end_date || cycleEnd)
 *   - 间隔天数 = FREQUENCY_INTERVAL_DAYS[inv.frequency]
 *   - 次数 = floor((终点 - 起点) / 间隔) + 1
 *
 * 注：这是一个简化估算（按 30/365 算月/年），精确算法需要按自然月/年迭代。
 */
export function countInvestmentOccurrences(
  inv: Pick<RecurringInvestment, 'start_date' | 'end_date' | 'frequency'>,
  cycleStart: Date,
  cycleEnd: Date,
): number {
  if (!inv.start_date) return 0;

  const startDate = parseDate(inv.start_date);
  const endDate = inv.end_date ? parseDate(inv.end_date) : null;

  // 起点和终点都收敛到周期内
  const effectiveStart = startDate > cycleStart ? startDate : cycleStart;
  const effectiveEnd = endDate && endDate < cycleEnd ? endDate : cycleEnd;

  if (effectiveStart >= effectiveEnd) return 0;

  const intervalDays = FREQUENCY_INTERVAL_DAYS[inv.frequency];
  if (intervalDays <= 0) return 0;

  // 区间内总天数（半开区间 [start, end) 不含 end）
  // diffDays(start, end) 返回 end - start 的天数差（不含端点）
  // 例：diffDays(6/21, 7/10) = 19，表示 19 天（6/21, 22, ..., 7/9）
  const totalDays = diffDays(effectiveStart, effectiveEnd);

  // 区间内每天/周/月/年一次
  // 例：19 天 daily → 19 次；19 天 weekly → ceil(19/7) = 3 次
  return Math.ceil(totalDays / intervalDays);
}

/**
 * 计算指定 day-of-month 在指定日期之后（不含）的下一次发生日期
 *
 * 例：today=6/21, day=14 → 下次扣款日是 7/14
 *     today=6/21, day=25 → 下次扣款日是 6/25（如果 today < 6/25）否则下月
 *     today=6/25, day=14 → 下次扣款日是 7/14（6/14 已过）
 *
 * 不限制搜索范围，调用方决定看多远
 */
function nextOccurrence(today: Date, day: number, weekendShift = false): Date {
  // 关键：顺延必须在"是否已过期"判断之前做。
  // 否则 6/27(周六) 会被判为"已过"跳到下月，而它本该顺延到 6/29(仍未到)。
  const shift = (d: Date) => (weekendShift ? shiftToWorkday(d) : d);
  // 当月（顺延后）
  const thisMonth = shift(getPaydayInMonth(today.getFullYear(), today.getMonth(), day));
  if (thisMonth >= today) return thisMonth;
  // 下月（顺延后）
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return shift(getPaydayInMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), day));
}

/**
 * 账单下次扣款日（相对今天）
 */
export function getBillNextDueDate(
  bill: Pick<RecurringBill, 'due_day'>,
  today: Date,
  weekendShift = false
): Date {
  return nextOccurrence(today, bill.due_day, weekendShift);
}

/**
 * 订阅下次扣款日
 */
export function getSubscriptionNextDueDate(
  sub: Pick<Subscription, 'billing_day'>,
  today: Date,
  weekendShift = false
): Date {
  return nextOccurrence(today, sub.billing_day, weekendShift);
}

/**
 * 账单的下一次扣款日是否在 [from, to) 区间内（用于"本期内即将发生"判断）
 */
export function isBillDueInRange(
  bill: Pick<RecurringBill, 'due_day'>,
  today: Date,
  from: Date,
  to: Date
): { inRange: boolean; dueDate: Date } {
  const due = nextOccurrence(today, bill.due_day);
  return { inRange: due >= from && due < to, dueDate: due };
}

export function isSubscriptionDueInRange(
  sub: Pick<Subscription, 'billing_day'>,
  today: Date,
  from: Date,
  to: Date
): { inRange: boolean; dueDate: Date } {
  const due = nextOccurrence(today, sub.billing_day);
  return { inRange: due >= from && due < to, dueDate: due };
}

/**
 * 计算订阅/账单在指定周期内是否活跃（与信用卡算法一致）
 *
 * 注：这个函数保留用于"严格按周期匹配"的场景（如老逻辑验证）
 * 推荐用 isBillDueInRange / isSubscriptionDueInRange 来找"下一次扣款"
 */
function isDayActiveInCycle(
  dueDay: number,
  cycleStart: Date,
  cycleEnd: Date,
): { active: boolean; dueDate: Date | null } {
  // 在周期起点所在月找
  const monthStart = getPaydayInMonth(cycleStart.getFullYear(), cycleStart.getMonth(), dueDay);
  if (monthStart >= cycleStart && monthStart < cycleEnd) {
    return { active: true, dueDate: monthStart };
  }
  // 周期终点所在月
  const monthEnd = getPaydayInMonth(cycleEnd.getFullYear(), cycleEnd.getMonth(), dueDay);
  if (monthEnd >= cycleStart && monthEnd < cycleEnd) {
    return { active: true, dueDate: monthEnd };
  }
  return { active: false, dueDate: null };
}

/**
 * 账单在指定周期内是否活跃（严格匹配）
 */
export function isBillActiveInCycle(
  bill: Pick<RecurringBill, 'due_day'>,
  cycleStart: Date,
  cycleEnd: Date,
) {
  return isDayActiveInCycle(bill.due_day, cycleStart, cycleEnd);
}

/**
 * 订阅在指定周期内是否活跃（严格匹配）
 */
export function isSubscriptionActiveInCycle(
  sub: Pick<Subscription, 'billing_day' | 'billing_cycle'>,
  cycleStart: Date,
  cycleEnd: Date,
): { active: boolean; dueDate: Date | null } {
  return isDayActiveInCycle(sub.billing_day, cycleStart, cycleEnd);
}

/**
 * 汇总收入在指定周期内所有到账日的总金额
 *
 * monthly: 找周期内所有 pay_day（最多 2 次：起点月 + 终点月）
 * weekly:  遍历周期内每一天，找出 day_of_week 匹配的天
 * single:  检查 start_date 是否在周期内(单次到账,start_date == end_date)
 */
export function sumIncomeInCycle(
  incomes: RecurringIncome[],
  cycleStart: Date,
  cycleEnd: Date,
): { total: number; items: UpcomingIncomeItem[] } {
  let total = 0;
  const items: UpcomingIncomeItem[] = [];

  for (const inc of incomes) {
    if (inc.frequency === 'monthly' && inc.pay_day != null) {
      // 起点月
      const d1 = getPaydayInMonth(cycleStart.getFullYear(), cycleStart.getMonth(), inc.pay_day);
      if (d1 >= cycleStart && d1 < cycleEnd) {
        total += inc.amount;
        items.push({
          id: inc.id,
          name: inc.name,
          amount: inc.amount,
          pay_date: formatDate(d1),
          days_until: Math.max(0, diffDays(cycleStart, d1)),
        });
      }
      // 终点月
      const d2 = getPaydayInMonth(cycleEnd.getFullYear(), cycleEnd.getMonth(), inc.pay_day);
      if (d2 >= cycleStart && d2 < cycleEnd && d2.getTime() !== d1.getTime()) {
        total += inc.amount;
        items.push({
          id: inc.id,
          name: inc.name,
          amount: inc.amount,
          pay_date: formatDate(d2),
          days_until: Math.max(0, diffDays(cycleStart, d2)),
        });
      }
    } else if (inc.frequency === 'weekly' && inc.day_of_week != null) {
      // 遍历周期内每一天
      const startDate = inc.start_date ? parseDate(inc.start_date) : null;
      const endDate = inc.end_date ? parseDate(inc.end_date) : null;
      for (let d = new Date(cycleStart); d < cycleEnd; d = addDays(d, 1)) {
        if (d.getDay() !== inc.day_of_week) continue;
        if (startDate && d < startDate) continue;
        if (endDate && d > endDate) continue;
        total += inc.amount;
        items.push({
          id: inc.id,
          name: inc.name,
          amount: inc.amount,
          pay_date: formatDate(d),
          days_until: Math.max(0, diffDays(cycleStart, d)),
        });
      }
    } else if (inc.frequency === 'single' && inc.start_date) {
      // 单次到账：start_date 在周期内才计入,只在那个周期算一次
      const d = parseDate(inc.start_date);
      if (d >= cycleStart && d < cycleEnd) {
        total += inc.amount;
        items.push({
          id: inc.id,
          name: inc.name,
          amount: inc.amount,
          pay_date: formatDate(d),
          days_until: Math.max(0, diffDays(cycleStart, d)),
        });
      }
    }
  }

  // 按 days_until 升序排序
  items.sort((a, b) => a.days_until - b.days_until);
  return { total, items };
}

// ============================================================
// v0.3 新增：升级版 computeDashboard（向后兼容）
// ============================================================

/**
 * V2 版仪表盘计算：在 V1 基础上加上 4 类定期事件的"净流入"
 *
 * 新公式：
 *   本期总支出 = V1.total_due + Σbills + Σsubs + Σinvestments
 *   本期总收入 = sumIncomeInCycle(incomes, ...)
 *   净流入     = 本期总收入 - 本期总支出
 *   净可用     = V1.total_net_cash + 净流入
 *   日均预算   = max(0, 净可用 ÷ V1.days_to_payday)
 *
 * 向后兼容：如果 investments/bills/incomes/subscriptions 为空数组，
 *           公式退化为 V1。
 */
export function computeDashboardV2(
  today: Date,
  config: UserConfig,
  cashSources: CashSource[],
  creditCards: CreditCard[],
  snapshots: Snapshot[] = [],
  investments: RecurringInvestment[] = [],
  bills: RecurringBill[] = [],
  incomes: RecurringIncome[] = [],
  subscriptions: Subscription[] = [],
): DashboardCalc & {
  prompt: SnapshotPrompt | null;
  currentSnapshots: Snapshot[];
  upcoming_expenses: UpcomingExpenses;
  upcoming_incomes: UpcomingIncomes;
  total_expense: number;
  total_income: number;
  net_flow: number;
} {
  // 1. 调用 V1（保持完全向后兼容）
  const v1 = computeDashboard(today, config, cashSources, creditCards, snapshots);

  // 2. 本期区间 = 用 v1 的 cycle（不是今天!）— 今天会漏掉本周期内已发生的工资/账单
  // 周期定义: [上期发薪日, 下期发薪日) = [6/10, 7/10) for pay_day=10
  const currentCycle = getCurrentCycle(today, config.pay_day);
  const cycleStart = currentCycle.start_date;
  const cycleEnd = currentCycle.end_date;

  // 3. 计算本期支出明细
  // 3a. 信用卡（已在 V1 中算过，复用）
  const upcomingCreditCards: ActiveCard[] = v1.active_cards;

  // 3b. 账单
  // V2.1: 改为"下一次扣款日"视角 —— 不限在本期内，展示所有账单的最近一次扣款
  // 这样健身房 (due_day=14, 今天 6/21) 也能显示为"7/14 扣款"
  const billItems: UpcomingExpenseItem[] = [];
  let totalBills = 0;
  for (const bill of bills) {
    // 找下一次扣款日（顺延在 nextOccurrence 内部、过期判断之前处理）
    const dueDate = nextOccurrence(today, bill.due_day, config.weekend_shift);
    // 判断是否在本期内（用于 net_flow 计算）
    const inCycle = dueDate >= cycleStart && dueDate < cycleEnd;
    if (inCycle) {
      totalBills += bill.amount;
    }
    // 显示：总是展示（即使不在本期，但能"即将发生"就显示）
    // 限制：日期距今天不超过 60 天（避免显示太远的）
    const days = diffDays(today, dueDate);
    if (days <= 60) {
      billItems.push({
        source_type: 'bill',
        id: bill.id,
        name: bill.name,
        amount: bill.amount,
        occurrences: 1,
        total: bill.amount,
        due_date: formatDate(dueDate),
        days_until: Math.max(0, days),
        in_current_cycle: inCycle,
      });
    }
  }

  // 3c. 订阅（同样改用"下一次扣款日"）
  const subscriptionItems: UpcomingExpenseItem[] = [];
  let totalSubs = 0;
  for (const sub of subscriptions) {
    const dueDate = nextOccurrence(today, sub.billing_day, config.weekend_shift);
    const inCycle = dueDate >= cycleStart && dueDate < cycleEnd;
    if (inCycle) {
      totalSubs += sub.amount;
    }
    const days = diffDays(today, dueDate);
    if (days <= 60) {
      const item: UpcomingExpenseItem = {
        source_type: 'subscription',
        id: sub.id,
        name: sub.name,
        amount: sub.amount,
        occurrences: 1,
        total: sub.amount,
        due_date: formatDate(dueDate),
        days_until: days,
        in_current_cycle: inCycle,
      };
      subscriptionItems.push(item);
      // 注意：不再重复 totalSubs += ，已在上面 inCycle 分支加过了
    }
  }

  // 3d. 投资（按频率 × 本期内次数）
  const investmentItems: UpcomingExpenseItem[] = [];
  let totalInvestments = 0;
  for (const inv of investments) {
    const occurrences = countInvestmentOccurrences(inv, cycleStart, cycleEnd);
    if (occurrences > 0) {
      const totalAmt = occurrences * inv.amount;
      // due_date 取首日（start_date 在本周期内的最早一天）
      const startDate = parseDate(inv.start_date);
      const firstOccur = startDate > cycleStart ? startDate : cycleStart;
      investmentItems.push({
        source_type: 'investment',
        id: inv.id,
        name: inv.name,
        amount: inv.amount,
        occurrences,
        total: totalAmt,
        due_date: formatDate(firstOccur),
        days_until: 0, // 投资是连续发生，没有具体某一天
        frequency: inv.frequency,
      });
      totalInvestments += totalAmt;
    }
  }

  // 按 days_until 升序排序
  billItems.sort((a, b) => a.days_until - b.days_until);
  subscriptionItems.sort((a, b) => a.days_until - b.days_until);

  // 4. 计算本期总收入
  const { total: totalIncome, items: incomeItems } = sumIncomeInCycle(incomes, cycleStart, cycleEnd);

  // 5. 本期总支出(整个周期 [cycleStart, cycleEnd))— 用于 net_flow 展示
  const totalCreditCards = v1.total_due;
  const totalExpense = totalCreditCards + totalBills + totalSubs + totalInvestments;

  // 6. 净可用 + 日均预算
  //   净可用 = 现金账户余额(扣锁定) - 信用卡本期应还
  //   日均   = 净可用 / 剩余天数(到下次发薪日)
  //   设计: 收入(income)只用于 UI 展示,纯参考;预算计算基于真实账上余额
  //   原因: 现金余额 = 历史存款 + 累计收入 - 累计支出,直接反映"现在能花多少"
  //   简化: 只扣"信用卡本期应还"(v1.total_due),不扣未来账单/订阅/投资
  //         那些会在 dashboard "本期支出明细"卡里展示,用户能自己看到
  const netAvailable = v1.total_net_cash - v1.total_due;
  const safeDays = Math.max(1, v1.days_to_payday);
  const dailyBudget = Math.max(0, Math.floor(netAvailable / safeDays));
  // netFlow 用整月 totalExpense(用于收支图 / 本期收入明细卡)
  const netFlow = totalIncome - totalExpense;

  return {
    ...v1,
    upcoming_expenses: {
      credit_cards: upcomingCreditCards,
      bills: billItems,
      subscriptions: subscriptionItems,
      investments: investmentItems,
      total_credit_card: totalCreditCards,
      total_bills: totalBills,
      total_subscriptions: totalSubs,
      total_investments: totalInvestments,
      grand_total: totalExpense,
    },
    upcoming_incomes: {
      items: incomeItems,
      total: totalIncome,
    },
    total_expense: totalExpense,
    total_income: totalIncome,
    net_flow: netFlow,
    // 覆盖 V1 的 net_available 和 daily_budget（用 V2 公式重算）
    net_available: netAvailable,
    daily_budget: dailyBudget,
  };
}