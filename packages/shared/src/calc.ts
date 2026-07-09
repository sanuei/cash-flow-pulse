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
  OneOffExpense,
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
 * 复用通用的 isDayActiveInCycle（下方定义，账单/订阅的 isBillActiveInCycle /
 * isSubscriptionActiveInCycle 也是同一个实现）——避免三份几乎一样的周期匹配逻辑分别维护。
 */
export function isCardActiveInCycle(
  card: CreditCard,
  cycleStart: Date,
  cycleEnd: Date
): { active: boolean; dueDate: Date | null } {
  return isDayActiveInCycle(card.due_day, cycleStart, cycleEnd);
}

/**
 * 取信用卡在指定扣款日生效的账单金额：
 * 1) 优先用 monthly_statements[YYYY-MM]（扣款日所在年月，已填的精确金额）
 * 2) 未填（如未来月）→ 回退到"早于该月的最近一期已填账单"（按最近消费预测）
 * 3) 都没有 → statement_amount（默认账单金额）
 */
export function getCardAmountForDate(card: CreditCard, dueDate: Date): number {
  const ym = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
  const stmts = card.monthly_statements;
  // 防御：monthly_statements 必须是「纯对象 + 数值」。
  // 若调用方忘了把 DB 里的 TEXT JSON 解析成对象（传进来是字符串），
  // Object.keys(string) 会得到字符下标、stmts[idx] 会返回单个字符 → 之后
  // sum + "字符" 变成字符串拼接，把 total_expense 撑成天文数字。这里一律回退。
  if (stmts && typeof stmts === 'object' && !Array.isArray(stmts)) {
    const override = stmts[ym];
    if (typeof override === 'number' && Number.isFinite(override)) return override;
    // 早于目标月的最近一期（YYYY-MM 字符串可直接字典序比较）
    const priorKeys = Object.keys(stmts).filter((k) => /^\d{4}-\d{2}$/.test(k) && k < ym).sort();
    const last = priorKeys[priorKeys.length - 1];
    const lastVal = last !== undefined ? stmts[last] : undefined;
    if (typeof lastVal === 'number' && Number.isFinite(lastVal)) return lastVal;
  }
  return card.statement_amount;
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
  // v1.4.4: 拆分"未扣 (active)"与"已扣 (paid_this_cycle)"。
  //   - 本期内活跃 = isCardActiveInCycle(保持不变)
  //   - active_cards:扣款日 > today 的卡(算 futureCreditCards 计入 net_available)
  //   - paid_this_cycle:扣款日 <= today 的卡(用户/银行已处理,显示但不算未来应付)
  //   注意:isCardActiveInCycle 内部 getPaydayInMonth 用本地午夜构造 Date,
  //   "已扣"判断也应基于本地午夜对齐,避免 6/29 23:59 vs 6/30 00:00 跨天误判
  //   业务语义:用户报告 pay_day=10 + due_day=29 + today=6/29 时,如果用户主动改了现金,
  //   6/29 仍 active 会导致余额已扣 + futureCreditCards 再扣 = 双重扣除。
  //   → 解决方案:扣款日 <= today 归 paid,UI 上仍能看见"今天已扣"badge,但不参与 budget 计算。
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const activeCards: ActiveCard[] = [];
  const paidThisCycle: ActiveCard[] = [];
  const inactiveCards: CreditCard[] = [];

  for (const card of creditCards) {
    const { active, dueDate } = isCardActiveInCycle(card, cycle.start_date, cycle.end_date);
    if (active && dueDate) {
      // 周末顺延:金额仍按原扣款日所在月取(顺延不跨月,月份归属不变)
      const effectiveDue = config.weekend_shift ? shiftToWorkday(dueDate) : dueDate;
      const effectiveDueMidnight = new Date(
        effectiveDue.getFullYear(), effectiveDue.getMonth(), effectiveDue.getDate()
      );
      const amount = getCardAmountForDate(card, dueDate);
      // 未夹取的原始差值:负数=已过,0=今天,正数=未来。夹取只在下面按分支各自做,
      // 避免 paid_this_cycle 卡全部被 Math.max(0,...) 夹成 0,导致"N 天前已扣"永远显示不出来
      const rawDiff = diffDays(today, effectiveDue);
      if (effectiveDueMidnight < todayMidnight) {
        // 已过:扣款日严格早于今天 → days_until_due 记"距今多少天前"(正数,UI 用于 "N 天前已扣")
        paidThisCycle.push({
          card,
          due_date: formatDate(effectiveDue),
          days_until_due: Math.abs(rawDiff),
          amount,
        });
      } else {
        const daysUntil = Math.max(0, rawDiff);
        const entry: ActiveCard = {
          card,
          due_date: formatDate(effectiveDue),
          days_until_due: daysUntil,
          amount,
        };
        // 今天或未来(都算 active,等用户行为)
        // v1.4.5 解释:之前测试期望 today==effectiveDue 算 active。
        // 现在 v1.4.6 改为统一不区分:都进 activeCards,UI 仍显示,但
        // net_available 用新的 future_due 字段(只算 effectiveDue > today)
        // → 避免双扣,但保持 total_due 语义稳定(活跃卡总额 = 6/29+未来)
        activeCards.push(entry);
      }
    } else {
      inactiveCards.push(card);
    }
  }

  // 按扣款日排序(最近的在前)
  activeCards.sort((a, b) => a.days_until_due - b.days_until_due);
  paidThisCycle.sort((a, b) => a.days_until_due - b.days_until_due);

  // 4. 应还总额（按月覆盖后的生效金额）
  //   total_due = active_cards 总和(本期要还,含今天/未来)→ 用于 totalExpense 展示
  //   future_due = active_cards 中 effectiveDue > today 的总和 → 用于 net_available/daily_budget
  //     (扣除款日 <= today 的:用户在余额中已体现或今天就要扣,不算"未来应付")
  //   这样 pay_day=10 + due_day=29 + today=6/29 场景:
  //     active_cards = [乐天30k, paypay112k, paidy3k] (sum=146k)
  //     total_due = 146k (本期支出明细显示 146k)
  //     future_due = 0 (今天已扣,不算未来应付) → net_available = 71k - 0 = 71k ✓
  const total_due = activeCards.reduce((sum, ac) => sum + ac.amount, 0);
  // future_due:active_cards 中 days_until_due > 0 (即 effectiveDue > today)
  // 避免重新 parse 字符串,直接用 days_until_due 判断(0 = 今天,>0 = 未来,<0 不可能因 Math.max(0, …))
  const future_due = activeCards
    .filter((ac) => ac.days_until_due > 0)
    .reduce((sum, ac) => sum + ac.amount, 0);

  // 5. 净可用 + 日均预算（v1.4.6：用 future_due 替代 total_due）
  const net_available = total_net_cash - future_due;
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
    paid_this_cycle: paidThisCycle,        // v1.4.4 新增:本周期已扣款的卡(不参与 net_available)
    inactive_cards: inactiveCards,
    total_due,                             // v1.4.6:含今天+未来,用于本期支出明细展示
    future_due,                            // v1.4.6:仅未来(> today),用于 net_available 避免双扣
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
 * 列出定投在 [from, to) 内的所有发生日（按 frequency + 扣款日锚点）。
 *   daily   : 区间内每天
 *   weekly  : 匹配 day_of_week（缺省用 start_date 的星期）的每天
 *   monthly : 每月 pay_day（缺省用 start_date 的日；超过当月天数按月末）
 *   yearly  : 每年 start_date 的月/日
 * 均受 start_date（含）与 end_date（含，null=永久）约束。
 *
 * v1.6：取代原「按 30/365 粗略间隔」的估算，改为按真实日历日枚举，
 *       让每月/每周定投能锚定到具体扣款日（也用于逐日现金流曲线的正确落点）。
 */
export function investmentOccurrenceDates(
  inv: Pick<RecurringInvestment, 'start_date' | 'end_date' | 'frequency'> &
    Partial<Pick<RecurringInvestment, 'pay_day' | 'day_of_week'>>,
  from: Date,
  to: Date,
): Date[] {
  if (!inv.start_date) return [];
  const start = parseDate(inv.start_date);
  // end_date 沿用原语义：作为区间上界（不含），保持既有数据的次数计算不变
  const end = inv.end_date ? parseDate(inv.end_date) : null;
  const lo = start > from ? start : from;
  const hi = end && end < to ? end : to;
  if (lo >= hi) return [];

  const dates: Date[] = [];
  switch (inv.frequency) {
    case 'single': {
      // 临时投资：只在 start_date 当天发生一次（落在窗口内才计）
      if (start >= lo && start < hi) dates.push(new Date(start));
      break;
    }
    case 'daily': {
      for (let d = new Date(lo); d < hi; d = addDays(d, 1)) dates.push(new Date(d));
      break;
    }
    case 'weekly': {
      const dow = inv.pay_day == null && inv.day_of_week == null ? start.getDay() : (inv.day_of_week ?? start.getDay());
      for (let d = new Date(lo); d < hi; d = addDays(d, 1)) {
        if (d.getDay() === dow) dates.push(new Date(d));
      }
      break;
    }
    case 'monthly': {
      const day = inv.pay_day ?? start.getDate();
      for (
        let cur = new Date(lo.getFullYear(), lo.getMonth(), 1);
        cur < hi;
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      ) {
        const d = getPaydayInMonth(cur.getFullYear(), cur.getMonth(), day);
        if (d >= lo && d < hi) dates.push(d);
      }
      break;
    }
    case 'yearly': {
      const mm = start.getMonth();
      const dd = start.getDate();
      for (let y = lo.getFullYear(); ; y++) {
        const d = getPaydayInMonth(y, mm, dd);
        if (d >= hi) break;
        if (d >= lo) dates.push(d);
      }
      break;
    }
  }
  return dates;
}

/**
 * 计算投资在指定周期内的发生次数（= investmentOccurrenceDates 的长度）
 */
export function countInvestmentOccurrences(
  inv: Pick<RecurringInvestment, 'start_date' | 'end_date' | 'frequency'> &
    Partial<Pick<RecurringInvestment, 'pay_day' | 'day_of_week'>>,
  cycleStart: Date,
  cycleEnd: Date,
): number {
  return investmentOccurrenceDates(inv, cycleStart, cycleEnd).length;
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
  oneOffs: OneOffExpense[] = [],
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
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // 3. 计算本期支出明细
  // 3a. 信用卡（已在 V1 中算过，复用）
  const upcomingCreditCards: ActiveCard[] = v1.active_cards;
  const paidCreditCards: ActiveCard[] = v1.paid_this_cycle;

  // 3b. 账单
  // 展示用的 due_date/days_until 仍是"下一次扣款日"(前瞻,见下方 nextOccurrence)——
  // 这样健身房 (due_day=14, 今天 6/21) 也能显示为"7/14 扣款"。
  // 但"是否算本期支出"(inCycle/totalBills) v1.5 改用 isBillActiveInCycle(跟信用卡
  // isCardActiveInCycle 同一实现):旧版用前瞻 nextOccurrence 判断本期归属,导致扣款日
  // 已过的账单(如房租 due_day=27,今天 30 号)nextOccurrence 滚到下个月、落进下一个发薪
  // 周期,这笔本期已扣的账单就从 totalBills/饼图/支出明细里彻底消失了。
  const billItems: UpcomingExpenseItem[] = [];
  let totalBills = 0;
  for (const bill of bills) {
    const { active: inCycle, dueDate: cycleDue } = isBillActiveInCycle(bill, cycleStart, cycleEnd);
    if (inCycle) {
      totalBills += bill.amount;
    }

    // 下一次扣款日（前瞻，用于"距今 X 天"展示，即使不在本期也显示"即将发生"）
    const dueDate = nextOccurrence(today, bill.due_day, config.weekend_shift);
    const days = diffDays(today, dueDate);

    // 本周期扣款状态（仿信用卡 active/paid_this_cycle 判断，用于 ExpensesPage "今天已扣" badge）
    // 与上面的 dueDate（前瞻，永远 >= today）不同：这里是本周期内的扣款日，
    // 可能已经过去（如房租 due_day=27，今天 30 号 → 本周期扣款日=27，已过 → 已扣）
    const effectiveCycleDue = cycleDue && config.weekend_shift ? shiftToWorkday(cycleDue) : cycleDue;
    const cycleDuePaid = effectiveCycleDue
      ? new Date(effectiveCycleDue.getFullYear(), effectiveCycleDue.getMonth(), effectiveCycleDue.getDate()) < todayMidnight
      : undefined;
    const cycleDaysUntil = effectiveCycleDue ? Math.abs(diffDays(todayMidnight, effectiveCycleDue)) : undefined;

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
        cycle_paid: cycleDuePaid,
        cycle_days_until: cycleDaysUntil,
        cycle_due_date: effectiveCycleDue ? formatDate(effectiveCycleDue) : undefined,
      });
    }
  }

  // 3c. 订阅（同 v1.5 修复：本期归属用 isSubscriptionActiveInCycle，不用前瞻 nextOccurrence）
  const subscriptionItems: UpcomingExpenseItem[] = [];
  let totalSubs = 0;
  for (const sub of subscriptions) {
    const { active: inCycle } = isSubscriptionActiveInCycle(sub, cycleStart, cycleEnd);
    if (inCycle) {
      totalSubs += sub.amount;
    }
    const dueDate = nextOccurrence(today, sub.billing_day, config.weekend_shift);
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
    const occDates = investmentOccurrenceDates(inv, cycleStart, cycleEnd);
    const occurrences = occDates.length;
    if (occurrences > 0) {
      const totalAmt = occurrences * inv.amount;
      // due_date 取本周期内的首个发生日（按扣款日锚点）
      const firstOccur = occDates[0]!;
      // 每周/每月/单次是离散扣款（有具体日子）→ 给出距今天数；每天/每年当作连续，days_until=0
      const discrete = inv.frequency === 'weekly' || inv.frequency === 'monthly' || inv.frequency === 'single';
      investmentItems.push({
        source_type: 'investment',
        id: inv.id,
        name: inv.name,
        amount: inv.amount,
        occurrences,
        total: totalAmt,
        due_date: formatDate(firstOccur),
        days_until: discrete ? Math.max(0, diffDays(today, firstOccur)) : 0,
        frequency: inv.frequency,
      });
      totalInvestments += totalAmt;
    }
  }

  // 3e. 临时账单（一次性支出，绑定具体日期）
  //   本期归属：date 落在 [cycleStart, cycleEnd) → 计入本期支出
  //   未来应付：date 在 [todayMidnight, cycleEnd) → 计入 net_available 扣减
  const oneOffItems: UpcomingExpenseItem[] = [];
  let totalOneOff = 0;
  let futureOneOff = 0;
  for (const o of oneOffs) {
    const d = parseDate(o.date);
    const inCycle = d >= cycleStart && d < cycleEnd;
    if (!inCycle) continue;
    totalOneOff += o.amount;
    const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const paid = dMidnight < todayMidnight;
    if (!paid) futureOneOff += o.amount; // date >= today → 尚未发生，算未来应付
    oneOffItems.push({
      source_type: 'one_off',
      id: o.id,
      name: o.name,
      amount: o.amount,
      occurrences: 1,
      total: o.amount,
      due_date: o.date,
      days_until: Math.max(0, diffDays(todayMidnight, d)),
      in_current_cycle: true,
      cycle_paid: paid,
      cycle_days_until: Math.abs(diffDays(todayMidnight, d)),
      cycle_due_date: o.date,
    });
  }
  oneOffItems.sort((a, b) => Number(a.cycle_paid ?? false) - Number(b.cycle_paid ?? false));

  // 按 days_until 升序排序
  billItems.sort((a, b) => a.days_until - b.days_until);
  subscriptionItems.sort((a, b) => a.days_until - b.days_until);

  // 4. 计算本期总收入
  const { total: totalIncome, items: incomeItems } = sumIncomeInCycle(incomes, cycleStart, cycleEnd);

  // 5. 本期总支出(整个周期 [cycleStart, cycleEnd))— 用于 net_flow 展示
  // v1.5 修复: v1.total_due 只含"未扣"的活跃卡(v1.4.6 起特意排除 paid_this_cycle，
  //   避免 net_available 双扣，见 future_due)。但这里是"本期支出明细"展示用途，
  //   已扣的卡这笔钱本期确实花了，不该从总支出里消失 → 显式加回 paid_this_cycle。
  const totalCreditCards = v1.total_due + paidCreditCards.reduce((s, ac) => s + ac.amount, 0);
  const totalExpense = totalCreditCards + totalBills + totalSubs + totalInvestments + totalOneOff;

  // 6. 净可用 + 日均预算
  //   净可用 = 现金账户余额 - 未来应付(从今天到下次发薪日)
  //   日均   = 净可用 / 剩余天数
  //   语义: "今天以后每天平均能花多少"
  //   v1.4 用户原话: "现金 - 信用卡应还 - 其他所有消费(当期健身房,房租等) ÷ 剩余天数"
  //   "未来应付"包括:
  //     - 信用卡本期应还(已扣或即将扣,v1.active_cards 都算)
  //     - 账单/订阅:nextOccurrence(today, due_day) >= today
  //     - 投资:daily/weekly/monthly 在 [today, cycleEnd) 区间内累计
  //   已过期的支出(6/10 房租)不重复扣
  //   例(6/28): 现金 271,774 - 信用卡 146,298 - 投资(12天 daily)18,816 = 106,660
  //             106,660 / 12 = ¥8,888/天
  //   注: 收入(income)只用于 UI 展示,不参与日均计算
  const safeDays = Math.max(1, v1.days_to_payday);

  // 计算"未来应付"(today ~ cycleEnd)
  // 信用卡:用 v1.future_due(v1.4.6 引入,只算 effectiveDue > today 的活跃卡)
  //   v1.active_cards 仍含"今天要扣"的卡(用于明细展示"今天扣款" badge),
  //   但 net_available 算预算时不能重复扣,所以用 v1.future_due(已剔除 today==effectiveDue)
  //   用户报告:pay_day=10 + due_day=29 + today=6/29 → future_due=0,不再双扣
  const futureCreditCards = v1.future_due;
  // 账单:nextOccurrence >= today 且在 cycleEnd 前
  let futureBills = 0;
  for (const bill of bills) {
    const dueDate = nextOccurrence(today, bill.due_day, config.weekend_shift);
    if (dueDate >= today && dueDate < cycleEnd) futureBills += bill.amount;
  }
  // 订阅:同上
  let futureSubs = 0;
  for (const sub of subscriptions) {
    const dueDate = nextOccurrence(today, sub.billing_day, config.weekend_shift);
    if (dueDate >= today && dueDate < cycleEnd) futureSubs += sub.amount;
  }
  // 投资:daily/weekly/monthly 在 [today, cycleEnd) 累计
  const futureInv = investments.reduce((s, inv) => {
    const occ = countInvestmentOccurrences(inv, today, cycleEnd);
    return s + occ * inv.amount;
  }, 0);

  const futureExpense = futureCreditCards + futureBills + futureSubs + futureInv + futureOneOff;
  const netAvailable = v1.total_net_cash - futureExpense;
  const dailyBudget = Math.max(0, Math.floor(netAvailable / safeDays));

  // netFlow 仍按收入-支出算(整月 totalExpense,用于收支图 / 本期收入明细卡)
  const netFlow = totalIncome - totalExpense;

  return {
    ...v1,
    upcoming_expenses: {
      credit_cards: upcomingCreditCards,
      credit_cards_paid: paidCreditCards,
      bills: billItems,
      subscriptions: subscriptionItems,
      investments: investmentItems,
      one_offs: oneOffItems,
      total_credit_card: totalCreditCards,
      total_bills: totalBills,
      total_subscriptions: totalSubs,
      total_investments: totalInvestments,
      total_one_off: totalOneOff,
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

// ============================================================
// 本期逐日现金流：按每笔扣款/到账的实际发生日推演 running balance
// 锚点 = 今天真实可用现金(未扣未来)；过去=实线、未来=虚线（由 is_past 标记）
// ============================================================

export type CashflowEventType = 'card' | 'bill' | 'subscription' | 'investment' | 'income' | 'one_off';
export type CashflowEvent = { label: string; amount: number; type: CashflowEventType };
export type CashflowPoint = { date: string; balance: number; is_past: boolean; events: CashflowEvent[] };
export type CashflowResult = {
  cycle_id: string;
  cycle_start: string;
  cycle_end: string;
  today: string;
  anchor: number;      // 今天锚点余额（真实可用现金）
  points: CashflowPoint[];
};

const cashflowMidMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// 收集某周期内每天的现金流变化 + 事件明细（信用卡金额走 getCardAmountForDate，未来月自动用最近一期）
function collectCycleDeltas(
  cycleStart: Date,
  cycleEnd: Date,
  config: UserConfig,
  creditCards: CreditCard[],
  investments: RecurringInvestment[],
  bills: RecurringBill[],
  incomes: RecurringIncome[],
  subscriptions: Subscription[],
  oneOffs: OneOffExpense[],
): { deltaByDay: Map<number, number>; eventsByDay: Map<number, CashflowEvent[]> } {
  const deltaByDay = new Map<number, number>();
  const eventsByDay = new Map<number, CashflowEvent[]>();
  const addEvent = (date: Date, delta: number, label: string, type: CashflowEventType) => {
    const ms = cashflowMidMs(date);
    deltaByDay.set(ms, (deltaByDay.get(ms) ?? 0) + delta);
    const list = eventsByDay.get(ms) ?? [];
    list.push({ label, amount: Math.round(delta), type });
    eventsByDay.set(ms, list);
  };

  for (const card of creditCards) {
    const { active, dueDate } = isCardActiveInCycle(card, cycleStart, cycleEnd);
    if (active && dueDate) {
      const eff = config.weekend_shift ? shiftToWorkday(dueDate) : dueDate;
      const amt = getCardAmountForDate(card, dueDate);
      if (amt > 0) addEvent(eff, -amt, card.name, 'card');
    }
  }
  for (const bill of bills) {
    const { active, dueDate } = isBillActiveInCycle(bill, cycleStart, cycleEnd);
    if (active && dueDate) {
      const eff = config.weekend_shift ? shiftToWorkday(dueDate) : dueDate;
      if (bill.amount > 0) addEvent(eff, -bill.amount, bill.name, 'bill');
    }
  }
  for (const sub of subscriptions) {
    const { active, dueDate } = isSubscriptionActiveInCycle(sub, cycleStart, cycleEnd);
    if (active && dueDate) {
      const eff = config.weekend_shift ? shiftToWorkday(dueDate) : dueDate;
      if (sub.amount > 0) addEvent(eff, -sub.amount, sub.name, 'subscription');
    }
  }
  for (const inv of investments) {
    for (const d of investmentOccurrenceDates(inv, cycleStart, cycleEnd)) {
      if (inv.amount > 0) addEvent(d, -inv.amount, inv.name, 'investment');
    }
  }
  for (const o of oneOffs) {
    const d = parseDate(o.date);
    if (d >= cycleStart && d < cycleEnd && o.amount > 0) addEvent(d, -o.amount, o.name, 'one_off');
  }
  const { items: incomeItems } = sumIncomeInCycle(incomes, cycleStart, cycleEnd);
  for (const it of incomeItems) {
    addEvent(parseDate(it.pay_date), it.amount, it.name, 'income');
  }

  return { deltaByDay, eventsByDay };
}

export function computeDailyCashflow(
  today: Date,
  config: UserConfig,
  cashSources: CashSource[],
  creditCards: CreditCard[],
  investments: RecurringInvestment[] = [],
  bills: RecurringBill[] = [],
  incomes: RecurringIncome[] = [],
  subscriptions: Subscription[] = [],
  periodsAhead = 0,   // 额外向未来延伸的周期数（0=只本期）
  oneOffs: OneOffExpense[] = [],
): CashflowResult {
  const todayMs = cashflowMidMs(today);
  // 今天锚点：真实可用现金（未扣未来项）
  const anchor = cashSources.reduce((s, c) => s + c.balance - c.locked_amount, 0);

  const cycle0 = getCurrentCycle(today, config.pay_day);
  const points: CashflowPoint[] = [];
  let carry = 0;                       // 上一期末的预测余额（链式递推起点）
  let lastEnd = cycle0.end_date_str;

  for (let p = 0; p <= periodsAhead; p++) {
    const cy = getCurrentCycle(addMonths(today, p), config.pay_day);
    lastEnd = cy.end_date_str;
    const { deltaByDay, eventsByDay } = collectCycleDeltas(
      cy.start_date, cy.end_date, config, creditCards, investments, bills, incomes, subscriptions, oneOffs,
    );
    const dayDelta = (ms: number) => deltaByDay.get(ms) ?? 0;

    const days: Date[] = [];
    for (let d = new Date(cy.start_date); d < cy.end_date; d = addDays(d, 1)) days.push(new Date(d));
    if (days.length === 0) continue;
    const dayMs = days.map(cashflowMidMs);
    const bal = new Array<number>(days.length);

    if (p === 0) {
      // 本期：以今天真实现金为锚点，向两边推演
      let todayIdx = dayMs.findIndex((ms) => ms === todayMs);
      if (todayIdx < 0) todayIdx = todayMs < dayMs[0]! ? 0 : days.length - 1;
      bal[todayIdx] = anchor;
      for (let i = todayIdx + 1; i < days.length; i++) bal[i] = bal[i - 1]! + dayDelta(dayMs[i]!);
      for (let i = todayIdx - 1; i >= 0; i--) bal[i] = bal[i + 1]! - dayDelta(dayMs[i + 1]!);
    } else {
      // 未来期：以上一期末预测余额为起点，逐日累加（全预测；发薪日会跳升）
      let prev = carry;
      for (let i = 0; i < days.length; i++) { prev += dayDelta(dayMs[i]!); bal[i] = prev; }
    }

    for (let i = 0; i < days.length; i++) {
      points.push({
        date: formatDate(days[i]!),
        balance: Math.round(bal[i]!),
        is_past: p === 0 && dayMs[i]! <= todayMs,
        events: eventsByDay.get(dayMs[i]!) ?? [],
      });
    }
    carry = bal[days.length - 1]!;
  }

  return {
    cycle_id: cycle0.cycle_id,
    cycle_start: cycle0.start_date_str,
    cycle_end: lastEnd,
    today: formatDate(today),
    anchor: Math.round(anchor),
    points,
  };
}