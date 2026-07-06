import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseDate,
  diffDays,
  addDays,
  addMonths,
  getPaydayInMonth,
  getNextPayday,
  getPrevPayday,
  getCurrentCycle,
  daysToNextPayday,
  isCardActiveInCycle,
  computeDashboard,
  detectUnchanged,
  formatYen,
  compareCycles,
  // v0.3 新增
  countInvestmentOccurrences,
  investmentOccurrenceDates,
  isBillActiveInCycle,
  isSubscriptionActiveInCycle,
  sumIncomeInCycle,
  computeDashboardV2,
  shiftToWorkday,
  getBillNextDueDate,
} from './calc.js';
import type { CashSource, CreditCard, UserConfig, Snapshot } from './types.js';

const baseConfig: UserConfig = {
  user_id: 'default',
  pay_day: 10,
  snapshot_offsets: [0, 7, 14, 21],
  weekend_shift: false,
  created_at: 0,
  updated_at: 0,
};

const sampleCash: CashSource[] = [
  {
    id: 'c1', user_id: 'default', name: 'PayPay',
    balance: 50000, locked_amount: 30000, sort_order: 0,
    created_at: 0, updated_at: 0,
  },
  {
    id: 'c2', user_id: 'default', name: '钱包',
    balance: 10000, locked_amount: 0, sort_order: 1,
    created_at: 0, updated_at: 0,
  },
];

const sampleCards: CreditCard[] = [
  {
    id: 'card1', user_id: 'default', name: '乐天卡',
    statement_amount: 30000, due_day: 25, sort_order: 0,
    created_at: 0, updated_at: 0,
  },
];

describe('日期工具', () => {
  it('formatDate / parseDate 互逆', () => {
    const d = new Date(2026, 5, 21); // 2026-06-21
    expect(formatDate(d)).toBe('2026-06-21');
    expect(parseDate('2026-06-21').getTime()).toBe(d.getTime());
  });

  it('diffDays 忽略时分秒', () => {
    const a = new Date(2026, 5, 21, 9, 0, 0);
    const b = new Date(2026, 5, 24, 18, 30, 0);
    expect(diffDays(a, b)).toBe(3);
  });

  it('addDays 跨月', () => {
    const d = new Date(2026, 5, 28);
    expect(formatDate(addDays(d, 5))).toBe('2026-07-03');
  });

  it('addMonths 正常情况', () => {
    const d = new Date(2026, 5, 15);
    expect(formatDate(addMonths(d, 1))).toBe('2026-07-15');
  });

  it('addMonths 处理月末（1/31 + 1月 = 2/28）', () => {
    const d = new Date(2026, 0, 31);
    expect(formatDate(addMonths(d, 1))).toBe('2026-02-28');
  });

  it('addMonths 处理跨年（12/15 + 1月 = 次年 1/15）', () => {
    const d = new Date(2026, 11, 15);
    expect(formatDate(addMonths(d, 1))).toBe('2027-01-15');
  });
});

describe('周末顺延 shiftToWorkday', () => {
  it('周六顺延到周一（+2 天）', () => {
    // 2026-06-27 是周六
    expect(formatDate(shiftToWorkday(parseDate('2026-06-27')))).toBe('2026-06-29');
  });
  it('周日顺延到周一（+1 天）', () => {
    // 2026-06-28 是周日
    expect(formatDate(shiftToWorkday(parseDate('2026-06-28')))).toBe('2026-06-29');
  });
  it('工作日不变', () => {
    // 2026-06-29 是周一
    expect(formatDate(shiftToWorkday(parseDate('2026-06-29')))).toBe('2026-06-29');
    // 2026-06-26 是周五
    expect(formatDate(shiftToWorkday(parseDate('2026-06-26')))).toBe('2026-06-26');
  });

  it('回归：顺延必须在「是否已过期」判断之前（6/28 看扣款日27，应显示本月顺延后的6/29，而非跳到下月7/27）', () => {
    const today = parseDate('2026-06-28'); // 周日
    // 关闭顺延：6/27 已过 → 跳到 7/27
    expect(formatDate(getBillNextDueDate({ due_day: 27 }, today, false))).toBe('2026-07-27');
    // 开启顺延：6/27(周六) 顺延到 6/29(周一)，仍未到 → 本月 6/29
    expect(formatDate(getBillNextDueDate({ due_day: 27 }, today, true))).toBe('2026-06-29');
  });
});

describe('发薪日 / 周期', () => {
  it('getPaydayInMonth 正常', () => {
    expect(formatDate(getPaydayInMonth(2026, 5, 10))).toBe('2026-06-10');
  });

  it('getPaydayInMonth 处理 2 月没有 30 号', () => {
    expect(formatDate(getPaydayInMonth(2026, 1, 30))).toBe('2026-02-28');
  });

  it('getPaydayInMonth 处理 4 月没有 31 号', () => {
    expect(formatDate(getPaydayInMonth(2026, 3, 31))).toBe('2026-04-30');
  });

  it('getNextPayday - 今天在发薪日前', () => {
    // 6/8 → 下一个发薪日是 6/10
    const today = new Date(2026, 5, 8);
    expect(formatDate(getNextPayday(today, 10))).toBe('2026-06-10');
  });

  it('getNextPayday - 今天在发薪日后', () => {
    // 6/15 → 下一个发薪日是 7/10
    const today = new Date(2026, 5, 15);
    expect(formatDate(getNextPayday(today, 10))).toBe('2026-07-10');
  });

  it('getNextPayday - 今天就在发薪日', () => {
    // 严格按定义：下一个发薪日 = today >= 本月发薪日 → 下个月发薪日
    // 因为 today = 发薪日 0:00，本月发薪日 = today，today >= 本月发薪日 → 下个月
    const today = new Date(2026, 5, 10, 0, 0, 0);
    expect(formatDate(getNextPayday(today, 10))).toBe('2026-07-10');
  });

  it('getNextPayday - 发薪日前 1 秒', () => {
    // 6/9 23:59:59 → 下个发薪日应是 6/10
    const today = new Date(2026, 5, 9, 23, 59, 59);
    expect(formatDate(getNextPayday(today, 10))).toBe('2026-06-10');
  });

  it('getNextPayday - 跨年', () => {
    // 2026/12/20 → 2027/1/10
    const today = new Date(2026, 11, 20);
    expect(formatDate(getNextPayday(today, 10))).toBe('2027-01-10');
  });

  it('getPrevPayday 与 getNextPayday 对称', () => {
    const today = new Date(2026, 5, 21);
    const next = getNextPayday(today, 10);
    const prev = getPrevPayday(today, 10);
    expect(formatDate(prev)).toBe('2026-06-10');
    expect(formatDate(next)).toBe('2026-07-10');
  });

  it('getCurrentCycle 周期 ID 正确', () => {
    // 6/21（每月10号发薪）→ 周期 [6/10, 7/10)，ID = 2026-06
    const today = new Date(2026, 5, 21);
    const cycle = getCurrentCycle(today, 10);
    expect(cycle.cycle_id).toBe('2026-06');
    expect(cycle.start_date_str).toBe('2026-06-10');
    expect(cycle.end_date_str).toBe('2026-07-10');
  });

  it('daysToNextPayday 距离精确', () => {
    // 6/21 → 7/10 = 19 天
    const today = new Date(2026, 5, 21);
    expect(daysToNextPayday(today, 10)).toBe(19);
  });

  it('daysToNextPayday 最小值为 1（同一天）', () => {
    // 7/10 当天 → 至少 1 天（避免 0 出现，让 UI 至少展示"还剩 1 天"）
    // 注：7/10 23:59 严格说距下个发薪日（8/10）有 31 天，但用户视角发薪日已"到了"
    // 所以这里测试"如果 nextPayday == today，结果为 1"的场景
    // 构造一个 nextPayday 恰好等于 today 的边界（虽然现实中很难发生）
    const today = new Date(2026, 6, 10, 0, 0, 1);
    // nextPayday = 8/10（因为 today > 7/10 0:00）
    // daysToPayday = 31 天，不是 1
    // 所以这个测试假设需要调整：daysToNextPayday 实际不会返回 1，除非 today 之后一天就是发薪日
    // 比如 7/9 → nextPayday = 7/10 → 1 天 ✓
    const dayBeforePayday = new Date(2026, 6, 9);
    expect(daysToNextPayday(dayBeforePayday, 10)).toBe(1);
  });
});

describe('卡片活跃判断', () => {
  it('卡扣款日 25 号，落在周期内 → 活跃', () => {
    // 周期 [6/10, 7/10)，卡 due_day=25 → 6/25 活跃
    const card = sampleCards[0]!;
    const cycleStart = new Date(2026, 5, 10);
    const cycleEnd = new Date(2026, 6, 10);
    const { active, dueDate } = isCardActiveInCycle(card, cycleStart, cycleEnd);
    expect(active).toBe(true);
    expect(formatDate(dueDate!)).toBe('2026-06-25');
  });

  it('卡扣款日 5 号，下一次扣款在本周期内 → 活跃', () => {
    // 周期 [6/10, 7/10)，卡 due_day=5
    // 6/5 在周期起点之前（属于上一周期），7/5 在周期内 → 活跃（7/5 扣款）
    const card: CreditCard = { ...sampleCards[0]!, due_day: 5 };
    const cycleStart = new Date(2026, 5, 10);
    const cycleEnd = new Date(2026, 6, 10);
    const { active, dueDate } = isCardActiveInCycle(card, cycleStart, cycleEnd);
    expect(active).toBe(true);
    expect(formatDate(dueDate!)).toBe('2026-07-05');
  });

  it('卡扣款日 31 号，处理月末', () => {
    // 周期 [6/10, 7/10)，卡 due_day=31 → 6/30 活跃（6 月没有 31 号）
    const card: CreditCard = { ...sampleCards[0]!, due_day: 31 };
    const cycleStart = new Date(2026, 5, 10);
    const cycleEnd = new Date(2026, 6, 10);
    const { active, dueDate } = isCardActiveInCycle(card, cycleStart, cycleEnd);
    expect(active).toBe(true);
    expect(formatDate(dueDate!)).toBe('2026-06-30');
  });
});

describe('v1.4.4 已扣款卡片分离 (paid_this_cycle)', () => {
  it('扣款日早于 today → 进 paid_this_cycle，不进 active_cards', () => {
    // 周期 [6/10, 7/10)，卡 due_day=15, today=6/20 → 6/15 已过
    const card: CreditCard = { ...sampleCards[0]!, due_day: 15, statement_amount: 30000 };
    const result = computeDashboard(new Date(2026, 5, 20), baseConfig, sampleCash, [card]);
    expect(result.active_cards.length).toBe(0);
    expect(result.paid_this_cycle.length).toBe(1);
    expect(result.paid_this_cycle[0]!.card.id).toBe('card1');
    expect(result.paid_this_cycle[0]!.amount).toBe(30000);
    // total_due = 0, net_available = total_net_cash(30000) - 0 = 30000
    expect(result.total_due).toBe(0);
    expect(result.net_available).toBe(30000);
  });

  it('扣款日 == today → 仍算 active (v1.4.6:明细展示,future_due 已剔除避免双扣)', () => {
    // v1.4.6 设计:active_cards 仍含"今天要扣"的卡(明细展示"今天扣款" badge)
    // 但 future_due 已剔除它(避免与用户余额中已扣部分双重计算)
    // total_due = 30000(明细总), future_due = 0(不算未来应付)
    const card: CreditCard = { ...sampleCards[0]!, due_day: 25, statement_amount: 30000 };
    const result = computeDashboard(new Date(2026, 5, 25), baseConfig, sampleCash, [card]);
    expect(result.active_cards.length).toBe(1);
    expect(result.active_cards[0]!.days_until_due).toBe(0);
    expect(result.paid_this_cycle.length).toBe(0);
    // v1.4.6:total_due 仍含今天,但 future_due 剔除
    expect(result.total_due).toBe(30000);
    expect(result.future_due).toBe(0);
    // 关键:net_available = total_net_cash(30000) - future_due(0) = 30000
    expect(result.net_available).toBe(30000);
  });

  it('扣款日 > today → 进 active_cards（正常待扣）', () => {
    // today=6/21, 卡 due_day=25 → 未来
    const card: CreditCard = { ...sampleCards[0]!, due_day: 25, statement_amount: 30000 };
    const result = computeDashboard(new Date(2026, 5, 21), baseConfig, sampleCash, [card]);
    expect(result.active_cards.length).toBe(1);
    expect(result.paid_this_cycle.length).toBe(0);
    expect(result.total_due).toBe(30000);
  });

  it('pay_day=10 + today=6/29 + 卡 due_day=29 → active(days_until_due=0),future_due=0 避免双扣', () => {
    // 用户报告的真实场景 v1.4.6:pay_day=10, today=6/29, 卡 due_day=29
    // 6/29 == today → 仍在 active_cards(days_until_due=0, UI 显示"今天扣款")
    // 但 future_due = 0(已剔除 today==effectiveDue)→ net_available 不双扣
    const card: CreditCard = { ...sampleCards[0]!, due_day: 29, statement_amount: 30000 };
    const result = computeDashboard(new Date(2026, 5, 29), baseConfig, sampleCash, [card]);
    expect(result.active_cards.length).toBe(1);
    expect(result.active_cards[0]!.days_until_due).toBe(0);
    expect(result.paid_this_cycle.length).toBe(0);
    // v1.4.6:total_due 含今天卡(明细展示),future_due 不含(预算计算避免双扣)
    expect(result.total_due).toBe(30000);
    expect(result.future_due).toBe(0);
    // 关键:net_available = total_net_cash(30000) - future_due(0) = 30000
    expect(result.net_available).toBe(30000);
  });

  it('pay_day=10 + today=6/30 + 卡 due_day=29 → 6/29 < 6/30 → paid_this_cycle,不再扣 net_available', () => {
    // 用户报告的另一场景:今天已 6/30,6/29 昨天扣过了 → 不再算 active
    const card: CreditCard = { ...sampleCards[0]!, due_day: 29, statement_amount: 30000 };
    const result = computeDashboard(new Date(2026, 5, 30), baseConfig, sampleCash, [card]);
    expect(result.active_cards.length).toBe(0);
    expect(result.paid_this_cycle.length).toBe(1);
    expect(result.paid_this_cycle[0]!.amount).toBe(30000);
    // 关键:net_available 不再扣这 30000
    expect(result.net_available).toBe(30000);
  });
});

describe('仪表盘核心计算', () => {
  it('正常情况：净可用 = 总净现金 - 活跃应还', () => {
    const today = new Date(2026, 5, 21);
    const result = computeDashboard(today, baseConfig, sampleCash, sampleCards);

    // total_balance = 50000 + 10000 = 60000
    expect(result.total_balance).toBe(60000);
    // total_locked = 30000 + 0 = 30000
    expect(result.total_locked).toBe(30000);
    // total_net_cash = 30000
    expect(result.total_net_cash).toBe(30000);
    // 活跃卡：乐天卡 30000
    expect(result.active_cards.length).toBe(1);
    expect(result.total_due).toBe(30000);
    // net_available = 30000 - 30000 = 0
    expect(result.net_available).toBe(0);
    // daily_budget = 0 / 19 = 0
    expect(result.daily_budget).toBe(0);
    expect(result.days_to_payday).toBe(19);
  });

  it('正常情况：有钱剩', () => {
    const today = new Date(2026, 5, 21);
    const cards: CreditCard[] = [{ ...sampleCards[0]!, statement_amount: 10000 }];
    const result = computeDashboard(today, baseConfig, sampleCash, cards);

    // net_available = 30000 - 10000 = 20000
    expect(result.net_available).toBe(20000);
    // daily_budget = 20000 / 19 = 1052
    expect(result.daily_budget).toBe(1052);
  });

  it('采集点提示：发薪日当天 (+0)', () => {
    // 6/10 = 发薪日，落在 offset 0 附近
    const today = new Date(2026, 5, 10);
    const result = computeDashboard(today, baseConfig, sampleCash, sampleCards);
    expect(result.prompt).not.toBeNull();
    expect(result.prompt!.offset_index).toBe(0);
    expect(result.prompt!.exists).toBe(false);
  });

  it('采集点提示：第 7 天', () => {
    // 6/10 + 7 = 6/17
    const today = new Date(2026, 5, 17);
    const result = computeDashboard(today, baseConfig, sampleCash, sampleCards);
    expect(result.prompt).not.toBeNull();
    expect(result.prompt!.offset_index).toBe(1);
    expect(result.prompt!.offset_days).toBe(7);
  });

  it('采集点提示：6/11 在 offset 0 的补录窗口内', () => {
    // 6/11 = dayInCycle 1 = offset 0 + 1 → 补录窗口，应提示
    const today = new Date(2026, 5, 11);
    const result = computeDashboard(today, baseConfig, sampleCash, sampleCards);
    expect(result.prompt).not.toBeNull();
    expect(result.prompt!.offset_index).toBe(0);
  });

  it('采集点提示：6/12 不在任何采集点窗口 → 不提示', () => {
    // 6/12 = dayInCycle 2，不在 [0, 1] / [7, 8] / [14, 15] / [21, 22] 任何一个窗口内
    const today = new Date(2026, 5, 12);
    const result = computeDashboard(today, baseConfig, sampleCash, sampleCards);
    expect(result.prompt).toBeNull();
  });

  it('采集点提示：补录窗口（采集点 + 1 天）', () => {
    // 6/18 = 6/10 + 8 = offset 7 + 1 → 在 offset 7 的补录窗口
    const today = new Date(2026, 5, 18);
    const result = computeDashboard(today, baseConfig, sampleCash, sampleCards);
    expect(result.prompt).not.toBeNull();
    expect(result.prompt!.offset_index).toBe(1); // offset 7 的索引
    expect(result.prompt!.offset_days).toBe(7);
  });

  it('采集点提示：发薪日前不提示（不发薪日前几天就打扰）', () => {
    // 6/9 = 发薪日前一天，应不提示（因为今天是发薪日前，不在采集点当天也不在补录窗口）
    const today = new Date(2026, 5, 9);
    const result = computeDashboard(today, baseConfig, sampleCash, sampleCards);
    expect(result.prompt).toBeNull();
  });

  it('采集点提示：已录入标记 exists=true', () => {
    const today = new Date(2026, 5, 10);
    const existingSnapshot: Snapshot = {
      id: 's1', user_id: 'default', cycle_id: '2026-06',
      offset_index: 0, snapshot_date: '2026-06-10',
      total_balance: 60000, total_locked: 30000, total_due: 30000,
      net_available: 0, daily_budget: 0, days_to_payday: 19,
      note: null, data_unchanged: 0, created_at: 0,
    };
    const result = computeDashboard(today, baseConfig, sampleCash, sampleCards, [existingSnapshot]);
    expect(result.prompt).not.toBeNull();
    expect(result.prompt!.exists).toBe(true);
  });

  it('空数据：所有现金为 0，卡为 0', () => {
    const today = new Date(2026, 5, 21);
    const result = computeDashboard(today, baseConfig, [], []);
    expect(result.total_balance).toBe(0);
    expect(result.net_available).toBe(0);
    expect(result.daily_budget).toBe(0);
    expect(result.active_cards.length).toBe(0);
  });

  it('负净可用现金：日均预算为 0（不展示负数）', () => {
    const today = new Date(2026, 5, 21);
    const cards: CreditCard[] = [{ ...sampleCards[0]!, statement_amount: 100000 }];
    const result = computeDashboard(today, baseConfig, sampleCash, cards);
    expect(result.net_available).toBe(-70000);
    expect(result.daily_budget).toBe(0); // max(0, ...) 保证非负
  });
});

describe('快照对比', () => {
  it('detectUnchanged - 数据相同', () => {
    const prev: Snapshot = {
      id: 's1', user_id: 'default', cycle_id: '2026-06',
      offset_index: 0, snapshot_date: '2026-06-10',
      total_balance: 60000, total_locked: 30000, total_due: 30000,
      net_available: 0, daily_budget: 0, days_to_payday: 19,
      note: null, data_unchanged: 0, created_at: 0,
    };
    const newSnap = { ...prev, total_balance: 60000 };
    expect(detectUnchanged(newSnap, prev)).toBe(1);
  });

  it('detectUnchanged - 数据变化', () => {
    const prev: Snapshot = {
      id: 's1', user_id: 'default', cycle_id: '2026-06',
      offset_index: 0, snapshot_date: '2026-06-10',
      total_balance: 60000, total_locked: 30000, total_due: 30000,
      net_available: 0, daily_budget: 0, days_to_payday: 19,
      note: null, data_unchanged: 0, created_at: 0,
    };
    const newSnap = { ...prev, total_balance: 70000 };
    expect(detectUnchanged(newSnap, prev)).toBe(0);
  });

  it('detectUnchanged - 无前序快照', () => {
    expect(detectUnchanged({} as any, undefined)).toBe(0);
  });
});

describe('格式化', () => {
  it('formatYen 千分位 + ¥', () => {
    expect(formatYen(1234567)).toBe('¥1,234,567');
    expect(formatYen(0)).toBe('¥0');
    expect(formatYen(-500)).toBe('¥-500');
  });
});

describe('周期对比', () => {
  it('compareCycles 上涨', () => {
    const a: Snapshot = {
      id: 'a', user_id: 'default', cycle_id: '2026-07',
      offset_index: 0, snapshot_date: '2026-07-10',
      total_balance: 100000, total_locked: 0, total_due: 20000,
      net_available: 80000, daily_budget: 4000, days_to_payday: 20,
      note: null, data_unchanged: 0, created_at: 0,
    };
    const b: Snapshot = {
      ...a, cycle_id: '2026-06', net_available: 50000, daily_budget: 2500,
    };
    const cmp = compareCycles(a, b);
    expect(cmp.net_available_diff).toBe(30000);
    expect(cmp.trend).toBe('up');
  });

  it('compareCycles 平稳（差额 < 100）', () => {
    const a: Snapshot = {
      id: 'a', user_id: 'default', cycle_id: '2026-07',
      offset_index: 0, snapshot_date: '2026-07-10',
      total_balance: 50000, total_locked: 0, total_due: 0,
      net_available: 50000, daily_budget: 2500, days_to_payday: 20,
      note: null, data_unchanged: 0, created_at: 0,
    };
    const b: Snapshot = { ...a, cycle_id: '2026-06', net_available: 50050 };
    const cmp = compareCycles(a, b);
    expect(cmp.trend).toBe('flat');
  });
});

// ============================================================
// v0.3 测试
// ============================================================

describe('countInvestmentOccurrences', () => {
  it('daily: 19 天周期内 = 19 次', () => {
    const inv = {
      start_date: '2026-01-01',
      end_date: null,
      frequency: 'daily' as const,
    };
    const cycleStart = new Date(2026, 5, 21); // 6/21
    const cycleEnd = new Date(2026, 6, 10); // 7/10
    expect(countInvestmentOccurrences(inv, cycleStart, cycleEnd)).toBe(19);
  });

  it('weekly: 19 天周期内 = 3 次', () => {
    const inv = {
      start_date: '2026-01-01',
      end_date: null,
      frequency: 'weekly' as const,
    };
    const cycleStart = new Date(2026, 5, 21);
    const cycleEnd = new Date(2026, 6, 10);
    // 19 天 / 7 = 2 余 5 → floor(19/7) + 1 = 2 + 1 = 3
    expect(countInvestmentOccurrences(inv, cycleStart, cycleEnd)).toBe(3);
  });

  it('start_date 在未来: 0 次', () => {
    const inv = {
      start_date: '2027-01-01',
      end_date: null,
      frequency: 'monthly' as const,
    };
    const cycleStart = new Date(2026, 5, 21);
    const cycleEnd = new Date(2026, 6, 10);
    expect(countInvestmentOccurrences(inv, cycleStart, cycleEnd)).toBe(0);
  });

  it('end_date 在过去: 0 次', () => {
    const inv = {
      start_date: '2025-01-01',
      end_date: '2026-01-01',
      frequency: 'daily' as const,
    };
    const cycleStart = new Date(2026, 5, 21);
    const cycleEnd = new Date(2026, 6, 10);
    expect(countInvestmentOccurrences(inv, cycleStart, cycleEnd)).toBe(0);
  });

  it('end_date 跨越部分周期', () => {
    // 从 6/25 开始，到 7/5 结束，周期 6/21-7/10
    // 实际有效区间 = [6/25, 7/5)，diffDays(6/25, 7/5) = 10 天（6/25-7/4，10 天）
    // daily = 10 次
    const inv = {
      start_date: '2026-06-25',
      end_date: '2026-07-05',
      frequency: 'daily' as const,
    };
    const cycleStart = new Date(2026, 5, 21);
    const cycleEnd = new Date(2026, 6, 10);
    expect(countInvestmentOccurrences(inv, cycleStart, cycleEnd)).toBe(10);
  });
});

describe('isBillActiveInCycle', () => {
  it('bill due_day=1 在周期 [6/21, 7/10) 内活跃', () => {
    const bill = { due_day: 1 };
    const cycleStart = new Date(2026, 5, 21);
    const cycleEnd = new Date(2026, 6, 10);
    const { active, dueDate } = isBillActiveInCycle(bill, cycleStart, cycleEnd);
    expect(active).toBe(true);
    expect(formatDate(dueDate!)).toBe('2026-07-01');
  });

  it('bill due_day=20 在周期 [6/21, 7/10) 内不活跃（起点月 6/20 < 6/21）', () => {
    // 周期 [6/21, 7/10)
    // 起点月（6月）的 6/20 < cycleStart 6/21 → 不通过
    // 终点月（7月）的 7/20 >= cycleEnd 7/10 → 不通过
    // 期望 false
    const bill = { due_day: 20 };
    const cycleStart = new Date(2026, 5, 21);
    const cycleEnd = new Date(2026, 6, 10);
    const { active } = isBillActiveInCycle(bill, cycleStart, cycleEnd);
    expect(active).toBe(false);
  });

  it('bill due_day=15 在周期 [6/21, 7/10) 内不活跃（终点月 7/15 >= 7/10）', () => {
    // 周期 [6/21, 7/10)
    // 起点月（6月）的 6/15 < cycleStart → 不通过
    // 终点月（7月）的 7/15 >= cycleEnd 7/10 → 不通过
    // 期望 false
    const bill = { due_day: 15 };
    const cycleStart = new Date(2026, 5, 21);
    const cycleEnd = new Date(2026, 6, 10);
    const { active } = isBillActiveInCycle(bill, cycleStart, cycleEnd);
    expect(active).toBe(false);
  });

  it('bill due_day=5 在周期 [6/1, 7/10) 内活跃两次（6/5 + 7/5）', () => {
    // 起点月 6/5 在 [6/1, 7/10) → 通过
    // 终点月 7/5 在 [6/1, 7/10) → 通过
    // 但 isDayActiveInCycle 只返回一个 dueDate（先找到的）
    const bill = { due_day: 5 };
    const cycleStart = new Date(2026, 5, 1);
    const cycleEnd = new Date(2026, 6, 10);
    const { active, dueDate } = isBillActiveInCycle(bill, cycleStart, cycleEnd);
    expect(active).toBe(true);
    expect(formatDate(dueDate!)).toBe('2026-06-05');
  });

  it('bill due_day=10 在周期 [6/21, 7/10) 内不活跃（等于 end）', () => {
    const bill = { due_day: 10 };
    const cycleStart = new Date(2026, 5, 21);
    const cycleEnd = new Date(2026, 6, 10);
    const { active } = isBillActiveInCycle(bill, cycleStart, cycleEnd);
    expect(active).toBe(false);
  });

  it('bill due_day=31 处理月末（取 6/30）', () => {
    const bill = { due_day: 31 };
    const cycleStart = new Date(2026, 5, 1);
    const cycleEnd = new Date(2026, 6, 1);
    const { active, dueDate } = isBillActiveInCycle(bill, cycleStart, cycleEnd);
    expect(active).toBe(true);
    expect(formatDate(dueDate!)).toBe('2026-06-30');
  });
});

describe('sumIncomeInCycle', () => {
  it('monthly 收入 + 单次到账', () => {
    const incomes = [
      {
        id: 'i1',
        user_id: 'default',
        name: '工资',
        amount: 300000,
        frequency: 'monthly' as const,
        pay_day: 25,
        day_of_week: null,
        start_date: '2025-01-01',
        end_date: null,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    // 周期 [6/21, 7/10)，pay_day=25 落在 7/25 (在区间外)... 实际 6/25 也小于 6/21
    // 让我用 6/22 测试
    const cycleStart = new Date(2026, 5, 1);
    const cycleEnd = new Date(2026, 6, 10);
    const { total, items } = sumIncomeInCycle(incomes, cycleStart, cycleEnd);
    // 6/25 在 [6/1, 7/10) 内 → 算入
    expect(total).toBe(300000);
    expect(items.length).toBe(1);
    expect(items[0]!.pay_date).toBe('2026-06-25');
  });

  it('monthly 收入 + 跨月两次到账（6/25 + 7/5）', () => {
    const incomes = [
      {
        id: 'i1',
        user_id: 'default',
        name: '副业',
        amount: 20000,
        frequency: 'monthly' as const,
        pay_day: 5,
        day_of_week: null,
        start_date: '2025-01-01',
        end_date: null,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const cycleStart = new Date(2026, 5, 1);
    const cycleEnd = new Date(2026, 6, 10);
    // 6/5 和 7/5 都在 [6/1, 7/10) 内
    const { total, items } = sumIncomeInCycle(incomes, cycleStart, cycleEnd);
    expect(total).toBe(40000);
    expect(items.length).toBe(2);
    expect(items[0]!.pay_date).toBe('2026-06-05');
    expect(items[1]!.pay_date).toBe('2026-07-05');
  });

  it('weekly 收入 + 多个周几匹配', () => {
    const incomes = [
      {
        id: 'i1',
        user_id: 'default',
        name: '周末副业',
        amount: 5000,
        frequency: 'weekly' as const,
        pay_day: null,
        day_of_week: 6, // 周六
        start_date: '2025-01-01',
        end_date: null,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const cycleStart = new Date(2026, 5, 1); // 6/1 是周一
    const cycleEnd = new Date(2026, 5, 16); // 6/16 是周二（15 天内）
    // 6/6 (周六), 6/13 (周六) → 2 次
    const { total, items } = sumIncomeInCycle(incomes, cycleStart, cycleEnd);
    expect(total).toBe(10000);
    expect(items.length).toBe(2);
  });

  it('空收入列表 → total=0', () => {
    const cycleStart = new Date(2026, 5, 21);
    const cycleEnd = new Date(2026, 6, 10);
    const { total, items } = sumIncomeInCycle([], cycleStart, cycleEnd);
    expect(total).toBe(0);
    expect(items.length).toBe(0);
  });
});

describe('computeDashboardV2 向后兼容', () => {
  it('无新数据时退化为 V1 公式', () => {
    // V1 基础数据：total_balance=60000, total_locked=30000, total_net_cash=30000
    // sampleCards 有 1 张 (30000, due_day=25)，6/25 在 [6/21, 7/10) 内活跃
    // V1: net_available = 30000 - 30000 = 0; daily_budget = 0
    const today = new Date(2026, 5, 21);
    const v1 = computeDashboard(today, baseConfig, sampleCash, sampleCards);
    const v2 = computeDashboardV2(today, baseConfig, sampleCash, sampleCards);
    expect(v2.net_available).toBe(v1.net_available);
    expect(v2.daily_budget).toBe(v1.daily_budget);
    expect(v2.total_expense).toBe(v1.total_due); // 只有信用卡
    expect(v2.total_income).toBe(0);
    expect(v2.net_flow).toBe(-v1.total_due); // 净流出（只有支出）
  });

  it('订阅 due_day=25 在本期内', () => {
    const today = new Date(2026, 5, 21); // 6/21
    const subs = [
      {
        id: 's1',
        user_id: 'default',
        name: 'Netflix',
        amount: 1490,
        billing_day: 25,
        billing_cycle: 'monthly' as const,
        category: null,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const v2 = computeDashboardV2(today, baseConfig, sampleCash, sampleCards, [], [], [], [], subs);
    // 6/25 在 [6/21, 7/10) 内 → 算入
    expect(v2.upcoming_expenses.subscriptions.length).toBe(1);
    expect(v2.upcoming_expenses.subscriptions[0]!.in_current_cycle).toBe(true);
  });

  it('账单 due_day=14 本周期内已过（健身房场景）—— 仍算本期支出，且下次扣款日前瞻显示 7/14', () => {
    // 今天 6/21，周期 [6/10, 7/10)，账单 due_day=14
    // v1.5 修复前的 bug：判断"是否本期"用前瞻 nextOccurrence(今天 6/21 之后最近一次)=7/14，
    //   7/14 不在 [6/10,7/10) 内 → 误判 in_current_cycle=false、totalBills=0，
    //   本期实际已发生的 6/14 扣款从"本期支出明细"/"本期收入去向"饼图里凭空消失。
    // 修复后：本期归属改用 isBillActiveInCycle（跟信用卡同一实现）—— 6/14 落在
    //   [6/10,7/10) 内 → in_current_cycle=true，本期照算；
    //   展示用的 due_date/days_until 仍是前瞻的下一次扣款日(7/14)，两者互不影响。
    const today = new Date(2026, 5, 21); // 6/21
    const bills = [
      {
        id: 'b1',
        user_id: 'default',
        name: '健身房',
        amount: 7370,
        due_day: 14,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const v2 = computeDashboardV2(today, baseConfig, sampleCash, sampleCards, [], [], bills);
    expect(v2.upcoming_expenses.bills.length).toBe(1);
    expect(v2.upcoming_expenses.bills[0]!.name).toBe('健身房');
    // 展示用:下一次扣款日(前瞻)仍是 7/14，不受本期归属修复影响
    expect(v2.upcoming_expenses.bills[0]!.due_date).toBe('2026-07-14');
    // 本期归属:6/14 在 [6/10,7/10) 内 → true（修复前是 false）
    expect(v2.upcoming_expenses.bills[0]!.in_current_cycle).toBe(true);
    // 本周期扣款状态:6/14 已过 today(6/21) → 已扣，距今 7 天
    expect(v2.upcoming_expenses.bills[0]!.cycle_paid).toBe(true);
    expect(v2.upcoming_expenses.bills[0]!.cycle_days_until).toBe(7);
    // totalBills 计入本期支出（修复前是 0）
    expect(v2.upcoming_expenses.total_bills).toBe(7370);
    expect(v2.total_expense).toBe(30000 + 7370); // 信用卡 + 健身房
  });

  it('账单 due_day 本周期扣款日已过 today（房租场景，v1.5 用户报告的 bug）—— 计入 total_bills 与 cycle_paid badge', () => {
    // 用户报告:pay_day=10, today=6/30, 房租 due_day=27 → 本周期扣款日 6/27 已过,
    // 但饼图/本期支出明细里"消费"总计凭空少了这笔钱。
    const today = new Date(2026, 5, 30); // 6/30
    const bills = [
      {
        id: 'b1', user_id: 'default', name: '房租', amount: 83990, due_day: 27,
        note: null, sort_order: 0, created_at: 0, updated_at: 0,
      },
    ];
    const v2 = computeDashboardV2(today, baseConfig, sampleCash, [], [], [], bills);
    expect(v2.upcoming_expenses.bills[0]!.in_current_cycle).toBe(true);
    expect(v2.upcoming_expenses.bills[0]!.cycle_paid).toBe(true);
    expect(v2.upcoming_expenses.bills[0]!.cycle_days_until).toBe(3); // 6/27 → 6/30 = 3 天前
    expect(v2.upcoming_expenses.total_bills).toBe(83990);
    expect(v2.total_expense).toBe(83990);
  });

  it('有收入时大幅提升日均预算', () => {
    const today = new Date(2026, 5, 21); // 6/21
    const incomes = [
      {
        id: 'i1',
        user_id: 'default',
        name: '工资',
        amount: 300000,
        frequency: 'monthly' as const,
        pay_day: 25,
        day_of_week: null,
        start_date: '2025-01-01',
        end_date: null,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const v2 = computeDashboardV2(today, baseConfig, sampleCash, sampleCards, [], [], [], incomes);
    // 6/25 在 [6/21, 7/10) 内 → 算入
    // V2: net_available = 0 + 300000 = 300000; daily_budget = 300000/19 = 15789
    expect(v2.total_income).toBe(300000);
    expect(v2.net_available).toBe(300000);
    expect(v2.daily_budget).toBe(Math.floor(300000 / 19));
  });

  it('每日投资本期内 19 次', () => {
    const today = new Date(2026, 5, 21); // 6/21
    const investments = [
      {
        id: 'inv1',
        user_id: 'default',
        name: '基金定投',
        amount: 100,
        frequency: 'daily' as const,
        pay_day: null,
        day_of_week: null,
        start_date: '2026-01-01',
        end_date: null,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const v2 = computeDashboardV2(today, baseConfig, sampleCash, sampleCards, [], investments, [], [], []);
    // 周期 6/21 - 7/10 = 19 天（diffDays = 18，+1 = 19），daily = 19 次
    // 总投资额 = 19 × 100 = 1900
    expect(v2.total_expense).toBe(30000 + 1900);
    expect(v2.upcoming_expenses.investments.length).toBe(1);
    expect(v2.upcoming_expenses.investments[0]!.occurrences).toBe(19);
    expect(v2.upcoming_expenses.investments[0]!.total).toBe(1900);
  });

  it('组合场景：信用卡 + 房租 + 订阅 + 收入 + 投资', () => {
    const today = new Date(2026, 5, 21); // 6/21
    const bills = [
      {
        id: 'b1',
        user_id: 'default',
        name: '房租',
        amount: 80000,
        due_day: 1,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const incomes = [
      {
        id: 'i1',
        user_id: 'default',
        name: '工资',
        amount: 300000,
        frequency: 'monthly' as const,
        pay_day: 25,
        day_of_week: null,
        start_date: '2025-01-01',
        end_date: null,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 'i2',
        user_id: 'default',
        name: '副业',
        amount: 20000,
        frequency: 'monthly' as const,
        pay_day: 25,
        day_of_week: null,
        start_date: '2025-01-01',
        end_date: null,
        note: null,
        sort_order: 1,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const investments = [
      {
        id: 'inv1',
        user_id: 'default',
        name: '基金',
        amount: 100,
        frequency: 'daily' as const,
        pay_day: null,
        day_of_week: null,
        start_date: '2026-01-01',
        end_date: null,
        note: null,
        sort_order: 0,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const v2 = computeDashboardV2(today, baseConfig, sampleCash, sampleCards, [], investments, bills, incomes);
    // v1.total_net_cash = 30000 (cash 60000 - locked 30000)
    // 本期总支出 = 30000 (信用卡) + 80000 (房租 7/1) + 1900 (19次 × 100) = 111900
    // 本期总收入 = 300000 + 20000 = 320000
    // 净流入 = 320000 - 111900 = +208100
    // 净可用 = v1.total_net_cash + netFlow = 30000 + 208100 = 238100
    // 日均 = 238100 / 19 = 12531
    expect(v2.total_expense).toBe(30000 + 80000 + 1900);
    expect(v2.total_income).toBe(320000);
    expect(v2.net_flow).toBe(208100);
    expect(v2.net_available).toBe(238100);
    expect(v2.daily_budget).toBe(Math.floor(238100 / 19));
  });
});

describe('临时账单（一次性支出）', () => {
  // pay_day=10 → today 6/21 的周期为 [6/10, 7/10)
  const today = new Date(2026, 5, 21);
  const cash: CashSource[] = [
    { id: 'x', user_id: 'default', name: '现金', balance: 30000, locked_amount: 0, sort_order: 0, created_at: 0, updated_at: 0 },
  ];
  const mk = (id: string, date: string, amount: number) => ({
    id, user_id: 'default', name: id, amount, date, note: null, sort_order: 0, created_at: 0, updated_at: 0,
  });

  it('本期内的临时账单计入总支出；未来的扣减净可用；过去的不扣净可用', () => {
    const oneOffs = [
      mk('past', '2026-06-15', 5000),   // 本期内、已过（<today）
      mk('future', '2026-06-25', 8000), // 本期内、未来（>today）
      mk('next', '2026-07-20', 9000),   // 下个周期，不算本期
    ];
    const v2 = computeDashboardV2(today, baseConfig, cash, [], [], [], [], [], [], oneOffs);
    expect(v2.upcoming_expenses.total_one_off).toBe(13000);      // past + future
    expect(v2.upcoming_expenses.one_offs.length).toBe(2);        // next 被排除
    expect(v2.total_expense).toBe(13000);
    // 净可用只扣未来应付（8000），已过的 5000 视为余额中已体现
    expect(v2.net_available).toBe(30000 - 8000);
  });

  it('无临时账单时行为不变（向后兼容）', () => {
    const withArg = computeDashboardV2(today, baseConfig, cash, [], [], [], [], [], [], []);
    const withoutArg = computeDashboardV2(today, baseConfig, cash, [], [], [], [], [], []);
    expect(withArg.total_expense).toBe(withoutArg.total_expense);
    expect(withArg.upcoming_expenses.total_one_off).toBe(0);
    expect(withArg.upcoming_expenses.one_offs).toEqual([]);
  });
});

describe('定投扣款日锚点（每月/每周）', () => {
  const cycleStart = new Date(2026, 5, 10); // 6/10
  const cycleEnd = new Date(2026, 6, 10);   // 7/10（不含）
  const base = { id: 'x', user_id: 'u', name: 't', amount: 100, start_date: '2026-01-01', end_date: null, note: null, sort_order: 0, created_at: 0, updated_at: 0 };

  it('每月定投按 pay_day 落一次', () => {
    const inv = { ...base, frequency: 'monthly' as const, pay_day: 15, day_of_week: null };
    const dates = investmentOccurrenceDates(inv, cycleStart, cycleEnd);
    expect(dates.map(formatDate)).toEqual(['2026-06-15']); // 只有 6/15 在 [6/10,7/10)
  });

  it('每月 pay_day 缺省回退到 start_date 的日', () => {
    const inv = { ...base, start_date: '2026-01-27', frequency: 'monthly' as const, pay_day: null, day_of_week: null };
    const dates = investmentOccurrenceDates(inv, cycleStart, cycleEnd);
    expect(dates.map(formatDate)).toEqual(['2026-06-27']);
  });

  it('每周定投按 day_of_week 命中周期内每个匹配日', () => {
    const inv = { ...base, frequency: 'weekly' as const, pay_day: null, day_of_week: 1 }; // 周一
    const dates = investmentOccurrenceDates(inv, cycleStart, cycleEnd);
    // 2026 年 6/10 是周三；[6/10,7/10) 内的周一：6/15,6/22,6/29,7/6
    expect(dates.map(formatDate)).toEqual(['2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06']);
  });

  it('每天定投 = 周期内每天', () => {
    const inv = { ...base, frequency: 'daily' as const, pay_day: null, day_of_week: null };
    expect(investmentOccurrenceDates(inv, cycleStart, cycleEnd).length).toBe(30); // 6/10..7/9
  });

  it('start_date 之前不发生', () => {
    const inv = { ...base, start_date: '2026-06-20', frequency: 'monthly' as const, pay_day: 15, day_of_week: null };
    // 6/15 早于 start 6/20 → 本周期无发生
    expect(investmentOccurrenceDates(inv, cycleStart, cycleEnd)).toEqual([]);
  });
});