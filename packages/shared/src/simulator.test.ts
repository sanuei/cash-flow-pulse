import { describe, it, expect } from 'vitest';
import {
  simulate, simulateScenarios, solveMonthlyInvest, solveRetireSpend, computeLevers, applySimSettings,
  SIM_DEFAULTS, type SimInput,
} from './simulator';

const base: SimInput = {
  ...SIM_DEFAULTS,
  startAge: 30,
  lifeExpectancy: 90,
  cash: 1_000_000,
  invested: 2_000_000,
  monthlyIncome: 400_000,
  monthlyLivingCost: 250_000,
  monthlyInvest: 100_000,
  retireSpendMonthly: 250_000,
  withdrawalRatePct: 4,
  annualReturnPct: 5,
  inflationPct: 0,
  events: [],
};

describe('simulate', () => {
  it('目标 = 退休后年支出 ÷ 提取率', () => {
    expect(simulate(base).target).toBe(75_000_000);
  });

  it('零收益零通胀：资产按结余线性增长', () => {
    const r = simulate({ ...base, annualReturnPct: 0, lifeExpectancy: 31, monthlyInvest: 0 });
    // 一年结余 150k × 12
    expect(r.rows[0]!.endTotal).toBeCloseTo(3_000_000 + 1_800_000, 0);
    expect(r.rows).toHaveLength(1);
  });

  it('现金被通胀侵蚀：利率 0、通胀 2% → 现金实际缩水', () => {
    const r = simulate({ ...base, monthlyIncome: 0, monthlyLivingCost: 0, monthlyInvest: 0, invested: 0, retireSpendMonthly: 0, inflationPct: 2, lifeExpectancy: 31 });
    expect(r.rows[0]!.endCash).toBeCloseTo(1_000_000 / 1.02, -1);
  });

  it('达标即退：达到目标那个月开始退休，之后不再有工资', () => {
    const r = simulate(base);
    expect(r.fireAge).not.toBeNull();
    expect(r.retireAge).toBe(r.fireAge);
    const retiredRow = r.rows.find((x) => x.year > Math.ceil(r.fireAge! - 30));
    expect(retiredRow!.income).toBe(0);
  });

  it('固定退休年龄：没达标也按时退休；钱不够会耗尽', () => {
    const r = simulate({ ...base, cash: 0, invested: 0, retireAge: 35 });
    expect(r.fireAge).toBeNull();
    expect(r.retireAge).toBe(35);
    expect(r.depletedAge).not.toBeNull();
  });

  it('最晚工作年龄：达不到目标也会在那个年龄停工资', () => {
    const r = simulate({ ...base, monthlyIncome: 260_000, monthlyInvest: 0, cash: 0, invested: 0, latestWorkAge: 50 });
    expect(r.retireAge).toBe(50);
  });

  it('养老金减少取款，钱撑得更久', () => {
    const poor = { ...base, cash: 0, invested: 0, monthlyIncome: 300_000, retireAge: 60, monthlyInvest: 50_000 };
    const without = simulate(poor);
    const withPension = simulate({ ...poor, pensionStartAge: 65, pensionMonthly: 150_000 });
    expect(without.depletedAge).not.toBeNull();
    expect(withPension.depletedAge === null || withPension.depletedAge > without.depletedAge!).toBe(true);
  });

  it('一次性大事件：当月从资产里扣掉', () => {
    const quiet = simulate({ ...base, annualReturnPct: 0, lifeExpectancy: 31 });
    const withCar = simulate({
      ...base, annualReturnPct: 0, lifeExpectancy: 31,
      events: [{ id: 'e', name: '买车', age: 30.5, amount: 2_000_000, years: 0, kind: 'expense' }],
    });
    expect(quiet.rows[0]!.endTotal - withCar.rows[0]!.endTotal).toBeCloseTo(2_000_000, 0);
    expect(withCar.rows[0]!.eventsNet).toBeCloseTo(-2_000_000, 0);
  });

  it('卖出投资时对收益部分扣税', () => {
    const s = { ...base, cash: 0, invested: 10_000_000, monthlyIncome: 0, monthlyLivingCost: 0, monthlyInvest: 0, retireAge: 30, retireSpendMonthly: 100_000, lifeExpectancy: 40 };
    const noTax = simulate(s);
    const taxed = simulate({ ...s, taxPct: 20 });
    expect(noTax.rows.reduce((a, r) => a + r.tax, 0)).toBe(0);
    expect(taxed.rows.reduce((a, r) => a + r.tax, 0)).toBeGreaterThan(0);
    expect(taxed.endAssets).toBeLessThan(noTax.endAssets);
  });

  it('现金缓冲：超出 N 个月生活费的现金转入投资，收益更高', () => {
    const a = simulate({ ...base, monthlyInvest: 0 });
    const b = simulate({ ...base, monthlyInvest: 0, cashBufferMonths: 6 });
    expect(b.fireMonth!).toBeLessThan(a.fireMonth ?? Infinity);
  });

  it('本金 + 收益 = 总资产（现金为正时）', () => {
    const r = simulate(base);
    const row = r.rows[5]!;
    expect(row.principal + row.gains).toBeCloseTo(row.endTotal, 0);
  });
});

describe('情景 / 反推 / 杠杆', () => {
  it('乐观 ≥ 基准 ≥ 悲观', () => {
    const s = simulateScenarios(base);
    expect(s.optimistic.fireMonth!).toBeLessThanOrEqual(s.base.fireMonth!);
    expect(s.base.fireMonth!).toBeLessThanOrEqual(s.pessimistic.fireMonth ?? Infinity);
  });

  it('反推每月定投：用解出来的金额正好能在目标年龄达成', () => {
    const need = solveMonthlyInvest(base, 55)!;
    expect(need).toBeGreaterThan(0);
    const r = simulate({ ...base, monthlyInvest: need, retireAge: null, latestWorkAge: 99 });
    expect(r.fireAge!).toBeLessThanOrEqual(55);
    const less = simulate({ ...base, monthlyInvest: need - 5000, retireAge: null, latestWorkAge: 99 });
    expect(less.fireAge === null || less.fireAge > 54.5).toBe(true);
  });

  it('反推每月定投：结余全投进去也达不到 → null', () => {
    // 20 年、结余 15 万/月全投 5%，到不了 7500 万
    expect(solveMonthlyInvest(base, 50)).toBeNull();
  });

  it('反推退休后支出：越晚退休能花得越多', () => {
    const a = solveRetireSpend(base, 45)!;
    const b = solveRetireSpend(base, 55)!;
    expect(b).toBeGreaterThan(a);
  });

  it('杠杆按提前月数从大到小排序', () => {
    const l = computeLevers(base);
    expect(l).toHaveLength(3);
    expect(l[0]!.monthsEarlier).toBeGreaterThanOrEqual(l[2]!.monthsEarlier);
  });

  it('applySimSettings 只覆盖给了的字段', () => {
    const out = applySimSettings(base, { annualReturnPct: 3, retireAge: 55 });
    expect(out.annualReturnPct).toBe(3);
    expect(out.retireAge).toBe(55);
    expect(out.monthlyIncome).toBe(base.monthlyIncome);
  });
});
