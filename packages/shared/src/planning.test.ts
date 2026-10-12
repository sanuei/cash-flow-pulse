import { describe, it, expect } from 'vitest';
import { computeFire, runwayMonths, computeCycleHistory, aggregateCycles, earliestDataDate } from './planning';

describe('runwayMonths', () => {
  it('现金 ÷ 月均生活成本，保留 1 位小数', () => {
    expect(runwayMonths(915515, 250000)).toBe(3.7);
  });
  it('没有生活成本数据 → null', () => {
    expect(runwayMonths(100000, 0)).toBeNull();
  });
  it('现金为负 → 0', () => {
    expect(runwayMonths(-5000, 100000)).toBe(0);
  });
});

describe('computeFire', () => {
  const base = { annualSpend: 3_000_000, withdrawalRatePct: 4, annualReturnPct: 0, monthlyContribution: 0 };

  it('目标 = 年支出 ÷ 提取率', () => {
    const r = computeFire({ ...base, currentAssets: 25_000_000 });
    expect(r.target).toBe(75_000_000);
    expect(r.gap).toBe(50_000_000);
    expect(r.progressPct).toBeCloseTo(33.3, 1);
    expect(r.reached).toBe(false);
  });

  it('已达成：gap ≤ 0，monthsToGoal = 0', () => {
    const r = computeFire({ ...base, currentAssets: 80_000_000 });
    expect(r.reached).toBe(true);
    expect(r.monthsToGoal).toBe(0);
    expect(r.progressPct).toBe(100);
  });

  it('零收益时，达成月数 = 差距 ÷ 每月储蓄', () => {
    const r = computeFire({ ...base, currentAssets: 75_000_000 - 1_200_000, monthlyContribution: 100_000 });
    expect(r.monthsToGoal).toBe(12);
  });

  it('有收益时比零收益更快', () => {
    const noReturn = computeFire({ ...base, currentAssets: 10_000_000, monthlyContribution: 200_000 });
    const withReturn = computeFire({ ...base, currentAssets: 10_000_000, monthlyContribution: 200_000, annualReturnPct: 5 });
    expect(withReturn.monthsToGoal!).toBeLessThan(noReturn.monthsToGoal!);
  });

  it('没有储蓄也没有收益 → 达不到（null）', () => {
    const r = computeFire({ ...base, currentAssets: 1_000_000 });
    expect(r.monthsToGoal).toBeNull();
  });

  it('没有年支出 → 无目标', () => {
    const r = computeFire({ ...base, annualSpend: 0, currentAssets: 1_000_000 });
    expect(r.target).toBe(0);
    expect(r.monthsToGoal).toBeNull();
  });
});

describe('computeCycleHistory', () => {
  const config = { user_id: 'u', pay_day: 25, snapshot_offsets: [0], weekend_shift: false, created_at: 0, updated_at: 0 };
  const cards = [{ id: 'c', user_id: 'u', name: 'x', statement_amount: 100000, due_day: 27,
    monthly_statements: { '2026-07': 300000 }, sort_order: 0, created_at: 0, updated_at: 0 }] as any;
  const incomes = [{ id: 'i', user_id: 'u', name: 's', amount: 350000, frequency: 'monthly', pay_day: 25,
    day_of_week: null, start_date: '2024-01-01', end_date: null }] as any;
  const input = { today: new Date(2026, 9, 3), config, cards, investments: [], bills: [], incomes, subscriptions: [], oneOffs: [] };

  it('按开始记账日期截断期数，按时间升序', () => {
    const cycles = computeCycleHistory({ ...input, dataStart: new Date(2026, 7, 1) });
    expect(cycles.map((c) => c.cycle_id)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(cycles[0]!.consume).toBe(300000); // 7 月账单覆盖
    expect(cycles[1]!.consume).toBe(300000); // 8 月未填 → 回退到最近一期
  });

  it('最多 maxCycles 期', () => {
    const cycles = computeCycleHistory({ ...input, dataStart: new Date(2020, 0, 1), maxCycles: 6 });
    expect(cycles).toHaveLength(6);
    const agg = aggregateCycles(cycles);
    expect(agg.n).toBe(6);
    expect(agg.avgIncome).toBe(350000);
  });

  it('earliestDataDate 取最早的信用卡账单月', () => {
    const d = earliestDataDate(new Date(2026, 8, 1).getTime(), null, cards, []);
    expect(d.getMonth()).toBe(6); // 2026-07
  });
});

describe('固定账单「从某天起生效」', () => {
  const config = { user_id: 'u', pay_day: 25, snapshot_offsets: [0], weekend_shift: false, created_at: 0, updated_at: 0 };
  const bill = (id: string, amount: number, start: string | null, end: string | null) =>
    ({ id, user_id: 'u', name: '房租', amount, due_day: 27, start_date: start, end_date: end, note: null, sort_order: 0, created_at: 0, updated_at: 0 });
  // 房租从 9/1 起由 80,000 涨到 95,000：旧条目截止 9/1，新条目从 9/1 开始
  const bills = [bill('old', 80000, null, '2026-09-01'), bill('new', 95000, '2026-09-01', null)];
  const input = { today: new Date(2026, 9, 3), config, cards: [], investments: [], incomes: [], subscriptions: [], oneOffs: [], bills, dataStart: new Date(2026, 4, 1) };

  it('往期按旧金额、生效日之后按新金额，不重叠不遗漏', () => {
    const cycles = computeCycleHistory(input);
    const byId = Object.fromEntries(cycles.map((c) => [c.cycle_id, c.bills]));
    expect(byId['2026-07']).toBe(80000); // 周期 7/25–8/25，扣款日 7/27
    expect(byId['2026-08']).toBe(80000); // 周期 8/25–9/25，扣款日 8/27（生效日前）
    expect(byId['2026-09']).toBe(95000); // 周期 9/25–10/25，扣款日 9/27
  });

  it('金额填 0 暂停 = 只截止旧条目：之后的周期不再扣', () => {
    const cycles = computeCycleHistory({ ...input, bills: [bill('old', 80000, null, '2026-09-01')] });
    const byId = Object.fromEntries(cycles.map((c) => [c.cycle_id, c.bills]));
    expect(byId['2026-08']).toBe(80000);
    expect(byId['2026-09']).toBe(0);
  });
});
